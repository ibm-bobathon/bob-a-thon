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
  router.post("/pull_request", async (req, res) => {
    try {
      app.log.info("Received request at /pull_request endpoint");

      // Extract PR data from request body
      const { diff_content, metadata } = req.body;
      
      if (!diff_content || !metadata) {
        return res.status(400).json({ error: "Missing diff_content or metadata" });
      }

      // Use the review agent to analyze the PR and generate comments
      app.log.info("Sending PR to review agent for analysis...");
      const reviewResult = await reviewPullRequest({
        prInfo: {
          number: metadata.pr_number,
          title: metadata.title,
          repository: metadata.repository
        },
        diff_content: diff_content
      });
      
      if (reviewResult.success) {
        app.log.info(`Review agent found ${reviewResult.comments.length} issues to comment on`);
        
        // Also log the review results for debugging
        console.log("=== REVIEW AGENT RESULTS ===");
        console.log(JSON.stringify({
          success: reviewResult.success,
          commentsGenerated: reviewResult.comments.length,
          comments: reviewResult.comments
        }, null, 2));
        console.log("=== END REVIEW RESULTS ===");
        
        res.json({ comments: reviewResult.comments });
      } else {
        app.log.error("Review agent failed:", reviewResult.error);
        console.log("Review agent error:", reviewResult.error);
        
        // Return stub response on failure
        const stubResponse = {
          comments: [
            {
              path: "githubagent/index.js",
              line: 15,
              body: "🤖 LLM Suggestion: Consider adding error handling for this API call.",
            },
          ],
        };
        res.json(stubResponse);
      }
    } catch (error) {
      app.log.error("Error processing pull request:", error.message);
      res.status(500).json({ error: "Internal server error" });
    }
  });


};