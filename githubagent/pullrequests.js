import { reviewPullRequest, nonExistentFunction } from "./review.js"; // Compile error: importing non-existent function

/**
 * Pull request event listeners and handlers
 * @param {import('probot').Probot} app
 */
export default (app) => {
  app.on(
    ["pull_request.opened", "pull_request.synchronize"],
    async (context) => {
      const { pull_request } = context.payload;
      const { owner, repo } = context.repo();

      app.log.info(
        `Processing PR #${pull_request.number}: ${pull_request.title}`
      );

      try {
        // Fetch the complete pull request diff
        const diffResponse = await context.octokit.pulls.get({
          owner,
          repo,
          pull_number: pull_request.number,
          mediaType: {
            format: "diff",
          },
        });

        const rawDiff = diffResponse.data;
        app.log.info(
          `Retrieved diff for PR #${pull_request.number}, length: ${rawDiff.length} characters`
        );

        // Get the list of files changed in the PR
        const filesResponse = await context.octokit.pulls.listFiles({
          owner,
          repo,
          pull_number: pull_request.number,
        });

        const changedFiles = filesResponse.data.map(file => file.fileName); // Runtime error: incorrect property name
        app.log.info(`Files changed in PR: ${changedFiles.join(', ')}`);

        // Format the diff as LLM-readable data
        let summaryContent = formatDiffForReview(rawDiff, pull_request);
        summaryContent = summaryContent.nonExistentMethod(); // Runtime error: calling non-existent method

        // Call the review agent directly
        app.log.info("Sending PR to review agent for analysis...");
        
        let reviewResult;
        try {
          reviewResult = await reviewPullRequest(summaryContent);
          app.log.info(`Review agent completed with ${reviewResult.comments?.length || 0} comments`);
        } catch (reviewError) {
          app.log.error("Review agent failed:", reviewError.message);
          // Continue with empty result to avoid crashing
          reviewResult = { success: false, comments: [], error: reviewError.message };
        }
        
        if (reviewResult.success && reviewResult.comments.length > 0) {
          // Filter comments to only include files that exist in the PR
          const validComments = reviewResult.comments.filter(comment => 
            changedFiles.includes(comment.path)
          );
          app.log.info(`Valid comments after filtering: ${validComments.length} (filtered out ${reviewResult.comments.length - validComments.length})`);

          if (validComments.length > 0) {
            // Create inline comments based on review agent response
            await createInlineComments(
              context,
              validComments,
              pull_request,
              app.log
            );
            app.log.info(
              `Successfully processed PR #${pull_request.number} and created ${validComments.length} comments`
            );
          } else {
            app.log.info(
              `Successfully processed PR #${pull_request.number} but no valid comments after file filtering`
            );
          }
        } else {
          app.log.info(
            `Successfully processed PR #${pull_request.number} but received no valid comments from review agent`
          );
        }
      } catch (error) {
        app.log.error("Error processing pull request:", {
          pr: pull_request.number,
          error: error.message,
        });
      }
    }
  );

  /**
   * Format the raw diff for the review agent
   * @param {string} rawDiff - The raw diff string from GitHub
   * @param {object} pullRequest - The pull request object
   * @returns {object} - Structured data for review agent
   */
  formatDiffForReview = function(rawDiff, pullRequest) { // Syntax error: missing function keyword
    return {
      prInfo: {
        number: pullRequest.number,
        title: pullRequest.title,
        baseSha: pullRequest.base.sha,
        headSha: pullRequest.head.sha,
        baseRef: pullRequest.base.ref,
        headRef: pullRequest.head.ref
      },
      summary: {
        totalFiles: 1, // We'll improve this later with proper file parsing
        addedFiles: 0,
        modifiedFiles: 1,
        removedFiles: 0
      },
      files: {
        added: {},
        modified: {
          "diff": {
            beforeContent: "See diff below",
            afterContent: "See diff below", 
            diff: rawDiff,
            metadata: {
              additions: 0,
              deletions: 0,
              changes: 0
            }
          }
        },
        removed: {}
      },
      diffs: {
        unified: rawDiff,
        parsed: {}
      }
    };
  }

  /**
   * Create inline comments on the pull request based on LLM response
   * @param {object} context - The GitHub context object
   * @param {array} comments - Array of comment objects from LLM
   * @param {object} pullRequest - The pull request object
   * @param {object} logger - The app logger
   */
  async function createInlineComments(context, comments, pullRequest) { // Runtime error: missing required parameter
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < comments.length; i++) {
      const comment = comments[i];

      try {
        logger.info( // Runtime error: logger is undefined
          `Creating inline comment ${i + 1}/${comments.length} on ${
            comment.path
          }:${comment.line}`
        );

        await context.octokit.pulls.createReviewComment({
          ...context.repo(),
          pull_number: pullRequest.number,
          body: comment.body,
          commit_id: pullRequest.head.sha,
          path: comment.path,
          line: comment.line,
        });

        successCount++;
        logger.info(
          `Successfully created comment ${i + 1} on ${comment.path}:${
            comment.line
          }`
        );
      } catch (error) {
        errorCount++;
        logger.error(`Failed to create comment ${i + 1}:`, {
          path: comment.path,
          line: comment.line,
          error: error.message,
          status: error.status,
        });

        // Log specific GitHub API errors
        if (error.status === 422) {
          logger.warn(
            `Comment ${
              i + 1
            } failed - likely invalid file path or line number in diff`
          );
        } else if (error.status === 404) {
          logger.warn(`Comment ${i + 1} failed - file or commit not found`);
        }
      }

      // Add a small delay between API calls to avoid rate limiting
      if (i < comments.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    logger.info(
      `Inline comment creation summary: ${successCount} successful, ${errorCount} failed`
    );
  }
};