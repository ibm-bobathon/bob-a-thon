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

        const firstChange = parseFirstChange(diffResponse.data);
        
        if (firstChange) {
          app.log.info(`Found first change at ${firstChange.path}:${firstChange.line}`);
          
          await context.octokit.pulls.createReviewComment({
            ...context.repo(),
            pull_number: pull_request.number,
            body: "change made here",
            commit_id: pull_request.head.sha,
            path: firstChange.path,
            line: firstChange.line,
          });

          app.log.info(`Successfully added comment on PR #${pull_request.number}`);
        } else {
          app.log.warn(`Could not identify first change in PR #${pull_request.number}`);
        }
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

  function parseFirstChange(diff) {
    app.log.debug("Parsing diff for first change");
    const lines = diff.split("\n");
    let currentFile = null;
    let lineNumber = 0;
    let inHunk = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // New file header
      if (line.startsWith("diff --git")) {
        const match = line.match(/diff --git a\/(.+) b\/(.+)/);
        if (match) {
          currentFile = match[2]; // Use the new file name
          lineNumber = 0;
          inHunk = false;
          app.log.debug(`Processing file: ${currentFile}`);
        }
      }
      // Hunk header - indicates start of changes
      else if (line.startsWith("@@") && currentFile) {
        const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (match) {
          lineNumber = parseInt(match[1], 10);
          inHunk = true;
          app.log.debug(`Starting hunk at line ${lineNumber}`);
        }
      }
      // Skip file headers
      else if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("index ")) {
        continue;
      }
      // Found an addition - this is what we're looking for
      else if (line.startsWith("+") && currentFile && inHunk && !line.startsWith("+++")) {
        app.log.debug(`Found first addition at ${currentFile}:${lineNumber}`);
        return {
          path: currentFile,
          line: lineNumber,
        };
      }
      // Count lines in the hunk
      else if (inHunk && currentFile && (line.startsWith(" ") || line.startsWith("+"))) {
        lineNumber++;
      }
      // Skip deletions (they don't increment the new line count)
      else if (line.startsWith("-") && !line.startsWith("---")) {
        continue;
      }
    }

    app.log.warn("No additions found in diff");
    return null;
  }
};
