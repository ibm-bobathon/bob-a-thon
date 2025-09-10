
import pullrequests from "./pullrequests.js";
import workflows from "./workflows.js";
import { reviewPullRequest } from "./review.js";

/**
 * This is the main entrypoint to your Probot app
 * @param {import('probot').Probot} app
 */
export default (app, { getRouter }) => {
  app.log.info("GitHub PR Diff Forwarder Bot loaded!");

  // Initialize workflows module
  workflows(app);

  // Initialize pull requests module
  pullrequests(app);

  // Set up the internal endpoint route
  const router = getRouter("/");

  // POST /pull_request - Internal endpoint for LLM processing
  router.post("/pull_request", (req, res) => {
    try {
      app.log.info("Received request at /pull_request endpoint");

      // For now, return the stub response
      const stubResponse = {
        comments: [
          {
            path: "githubagent/index.js",
            line: 15,
            body: "🤖 LLM Suggestion: Consider adding error handling for this API call.",
          },
        });

        // Get comprehensive PR analysis with all file contents and diffs
        const prAnalysis = await getComprehensivePRAnalysis(context, pull_request, files.data, diffResponse.data);
        
        // Create summaryContent object with all the data
        const summaryContent = {
          prInfo: {
            number: pull_request.number,
            title: pull_request.title,
            baseSha: pull_request.base.sha,
            headSha: pull_request.head.sha,
            baseRef: pull_request.base.ref,
            headRef: pull_request.head.ref
          },
          summary: {
            totalFiles: prAnalysis.summary.totalFiles,
            addedFiles: prAnalysis.summary.addedFiles,
            modifiedFiles: prAnalysis.summary.modifiedFiles,
            removedFiles: prAnalysis.summary.removedFiles
          },
          files: prAnalysis.files,
          diffs: prAnalysis.diffs
        };

        // Use the review agent to analyze the PR and generate comments
        app.log.info("Sending PR to review agent for analysis...");
        const reviewResult = await reviewPullRequest(summaryContent);
        
        if (reviewResult.success) {
          app.log.info(`Review agent found ${reviewResult.comments.length} issues to comment on`);
          
          // Post each comment to the PR
          for (const comment of reviewResult.comments) {
            try {
              await context.octokit.pulls.createReviewComment({
                ...context.repo(),
                pull_number: pull_request.number,
                body: comment.body,
                commit_id: pull_request.head.sha,
                path: comment.path,
                line: comment.line,
              });
              
              app.log.info(`Posted comment on ${comment.path}:${comment.line}`);
            } catch (commentError) {
              app.log.warn(`Failed to post comment on ${comment.path}:${comment.line}:`, commentError.message);
            }
          }
          
          // Also log the review results for debugging
          console.log("=== REVIEW AGENT RESULTS ===");
          console.log(JSON.stringify({
            success: reviewResult.success,
            commentsGenerated: reviewResult.comments.length,
            comments: reviewResult.comments
          }, null, 2));
          console.log("=== END REVIEW RESULTS ===");
          
        } else {
          app.log.error("Review agent failed:", reviewResult.error);
          console.log("Review agent error:", reviewResult.error);
        }

      res.json(stubResponse);
    } catch (error) {
      app.log.error("Error processing pull request:", error.message);
      res.status(500).json({ error: "Internal server error" });
    }
  });


};