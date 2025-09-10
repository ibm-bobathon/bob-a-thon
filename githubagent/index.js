/**
 * This is the main entrypoint to your Probot app
 * @param {import('probot').Probot} app
 */
export default (app) => {
  app.log.info("GitHub PR Comment Bot loaded!");

  app.on(
    ["pull_request.opened", "pull_request.synchronize"],
    async (context) => {
      const { pull_request } = context.payload;
      
      app.log.info(`Processing PR #${pull_request.number}: ${pull_request.title}`);

      try {
        // Get the files changed in the PR
        const files = await context.octokit.pulls.listFiles({
          ...context.repo(),
          pull_number: pull_request.number,
        });

        if (files.data.length === 0) {
          app.log.info("No files changed in this PR");
          return;
        }

        // Find the first file with changes
        const firstFile = files.data[0];
        app.log.info(`First changed file: ${firstFile.filename}`);

        // Get the diff for detailed analysis
        const diffResponse = await context.octokit.pulls.get({
          ...context.repo(),
          pull_number: pull_request.number,
          mediaType: {
            format: "diff",
          },
        });

        // Get comprehensive PR analysis with all file contents and diffs
        const prAnalysis = await getComprehensivePRAnalysis(context, pull_request, files.data, diffResponse.data);
        
        app.log.info(`PR Analysis complete:`, {
          totalFiles: prAnalysis.summary.totalFiles,
          added: prAnalysis.summary.addedFiles,
          modified: prAnalysis.summary.modifiedFiles,
          removed: prAnalysis.summary.removedFiles
        });
        
        // For now, just log the analysis - you can add LLM integration here later
        app.log.debug('Full PR Analysis:', JSON.stringify(prAnalysis, null, 2));
        
        // Example: Create a single comment with summary
        const summaryComment = `## PR Analysis Summary
        
**Files Changed:** ${prAnalysis.summary.totalFiles}
- 🟢 Added: ${prAnalysis.summary.addedFiles}
- 🟡 Modified: ${prAnalysis.summary.modifiedFiles}  
- 🔴 Removed: ${prAnalysis.summary.removedFiles}

**Ready for LLM analysis with full context and diffs!**`;

        await context.octokit.issues.createComment({
          ...context.repo(),
          issue_number: pull_request.number,
          body: summaryComment
        });

        app.log.info(`Successfully analyzed PR #${pull_request.number}`);
      } catch (error) {
        app.log.error("Error processing pull request:", {
          pr: pull_request.number,
          error: error.message,
          stack: error.stack
        });
      }
    }
  );

  // Add debugging for all webhook events
  app.onAny(async (context) => {
    app.log.debug(`Received webhook: ${context.name}.${context.payload.action || 'no-action'}`);
  });

  async function getComprehensivePRAnalysis(context, pull_request, files, fullDiff) {
    app.log.info("Starting comprehensive PR analysis...");
    
    const analysis = {
      prInfo: {
        number: pull_request.number,
        title: pull_request.title,
        baseSha: pull_request.base.sha,
        headSha: pull_request.head.sha,
        baseRef: pull_request.base.ref,
        headRef: pull_request.head.ref
      },
      summary: {
        totalFiles: files.length,
        addedFiles: 0,
        modifiedFiles: 0,
        removedFiles: 0
      },
      files: {
        added: {},      // filename -> { content, metadata }
        modified: {},   // filename -> { beforeContent, afterContent, diff, metadata }
        removed: {}     // filename -> { content, metadata }
      },
      diffs: {
        unified: fullDiff,  // The complete unified diff
        parsed: {}          // filename -> structured diff data
      }
    };

    // Process each file
    for (const file of files) {
      app.log.debug(`Processing file: ${file.filename} (${file.status})`);
      
      try {
        switch (file.status) {
          case 'added':
            analysis.files.added[file.filename] = await getAddedFileData(context, file, pull_request.head.sha);
            analysis.summary.addedFiles++;
            break;
            
          case 'modified':
            analysis.files.modified[file.filename] = await getModifiedFileData(context, file, pull_request);
            analysis.summary.modifiedFiles++;
            break;
            
          case 'removed':
            analysis.files.removed[file.filename] = await getRemovedFileData(context, file, pull_request.base.sha);
            analysis.summary.removedFiles++;
            break;
        }
      } catch (error) {
        app.log.warn(`Failed to process file ${file.filename}:`, error.message);
      }
    }

    // Parse the unified diff for structured access
    analysis.diffs.parsed = parseUnifiedDiff(fullDiff);
    
    app.log.info(`PR analysis complete: ${analysis.summary.totalFiles} files processed`);
    return analysis;
  }

  async function getAddedFileData(context, file, headSha) {
    // Get the content of the newly added file
    const content = await context.octokit.repos.getContent({
      ...context.repo(),
      path: file.filename,
      ref: headSha
    });

    return {
      content: Buffer.from(content.data.content, 'base64').toString(),
      metadata: {
        additions: file.additions,
        deletions: file.deletions, // Should be 0 for added files
        changes: file.changes,
        blobUrl: file.blob_url,
        rawUrl: file.raw_url,
        sha: content.data.sha
      }
    };
  }

  async function getModifiedFileData(context, file, pull_request) {
    // Get the file content from both base and head
    const [beforeContent, afterContent] = await Promise.all([
      context.octokit.repos.getContent({
        ...context.repo(),
        path: file.filename,
        ref: pull_request.base.sha
      }).catch(() => null), // File might not exist in base
      
      context.octokit.repos.getContent({
        ...context.repo(),
        path: file.filename,
        ref: pull_request.head.sha
      }).catch(() => null) // File might not exist in head
    ]);

    return {
      beforeContent: beforeContent ? Buffer.from(beforeContent.data.content, 'base64').toString() : null,
      afterContent: afterContent ? Buffer.from(afterContent.data.content, 'base64').toString() : null,
      diff: file.patch || null, // The GitHub-provided patch/diff for this file
      metadata: {
        additions: file.additions,
        deletions: file.deletions,
        changes: file.changes,
        blobUrl: file.blob_url,
        rawUrl: file.raw_url,
        previousFilename: file.previous_filename || null,
        beforeSha: beforeContent?.data.sha || null,
        afterSha: afterContent?.data.sha || null
      }
    };
  }

  async function getRemovedFileData(context, file, baseSha) {
    // Get the content of the file that was removed (from base)
    const content = await context.octokit.repos.getContent({
      ...context.repo(),
      path: file.filename,
      ref: baseSha
    });

    return {
      content: Buffer.from(content.data.content, 'base64').toString(),
      metadata: {
        additions: file.additions, // Should be 0 for removed files
        deletions: file.deletions,
        changes: file.changes,
        sha: content.data.sha
      }
    };
  }

  function parseUnifiedDiff(diff) {
    app.log.debug("Parsing unified diff into structured format");
    const parsed = {};
    const lines = diff.split("\n");
    let currentFile = null;
    let currentHunk = null;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // New file header
      if (line.startsWith("diff --git")) {
        const match = line.match(/diff --git a\/(.+) b\/(.+)/);
        if (match) {
          currentFile = match[2];
          parsed[currentFile] = {
            oldPath: match[1],
            newPath: match[2],
            hunks: []
          };
          currentHunk = null;
        }
      }
      // File mode/index info
      else if (line.startsWith("index ") && currentFile) {
        const match = line.match(/index ([a-f0-9]+)\.\.([a-f0-9]+)/);
        if (match) {
          parsed[currentFile].oldSha = match[1];
          parsed[currentFile].newSha = match[2];
        }
      }
      // Hunk header
      else if (line.startsWith("@@") && currentFile) {
        const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)/);
        if (match) {
          currentHunk = {
            oldStart: parseInt(match[1]),
            oldLines: parseInt(match[2] || "1"),
            newStart: parseInt(match[3]),
            newLines: parseInt(match[4] || "1"),
            header: match[5].trim(),
            changes: []
          };
          parsed[currentFile].hunks.push(currentHunk);
        }
      }
      // Actual diff content
      else if (currentHunk && (line.startsWith("+") || line.startsWith("-") || line.startsWith(" "))) {
        currentHunk.changes.push({
          type: line[0] === "+" ? "addition" : line[0] === "-" ? "deletion" : "context",
          content: line.substring(1),
          line: line
        });
      }
    }

    return parsed;
  }
};
