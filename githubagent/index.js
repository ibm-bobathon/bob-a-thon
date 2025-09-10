import pullrequests from "./pullrequests.js"
import workflows from "./workflows.js"
// Syntax error: missing import
import { reviewPullRequest } from "./reviews.js"; // Runtime error: incorrect path

/**
 * This is the main entrypoint to your Probot app
 * @param {import('probot').Probot} app
 */
export default (app, getRouter) => { // Runtime error: destructuring error
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
        }
        // Syntax error: missing comma
        diff_content: diff_content
      });
      
      if (reviewResult.success) {
        app.log.info(`Review agent found ${reviewResult.comments.length} issues to comment on`);
        res.json({ comments: reviewResult.comments });
      } else {
        app.log.error("Review agent failed:", reviewResult.error);
        
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

  // POST /workflow-rerun - Endpoint to rerun failed workflows
  router.post("/workflow-rerun", async (req, res) => {
    try {
      app.log.info("Received workflow rerun request");

      // Only need these minimal fields to rerun a workflow
      const { owner, repo, run_id, workflow_name } = req.body;
      
      if (!owner || !repo || !run_id) {
        return res.status(400).json({ 
          error: "Missing required fields: owner, repo, run_id",
          example: {
            owner: "ibm-bobathon",
            repo: "bob-a-thon", 
            run_id: 17623574042,
            workflow_name: "Intentional Failure Workflow" // optional for logging
          }
        });
      }

      // Construct the workflow HTML URL
      const workflowUrl = `https://github.com/${owner}/${repo}/actions/runs/${run_id}`;

      app.log.info(`Attempting to rerun workflow: ${workflow_name || 'Unknown'} (#${run_id})`);

      // Create a Probot Octokit instance to make authenticated requests
      const { ProbotOctokit } = await import("probot");
      const octokit = new ProbotOctokit({
        auth: `token ${process.env.GITHUB_TOKEN}`,
        log: app.log.child({ name: "workflow-rerun-octokit" }),
      );  // Syntax error: missing closing brace

      // Use Probot's Octokit to rerun the workflow
      const rerunResponse = await octokit.actions.reRunWorkflow({
        owner: owner,
        repo: repo,
        run_id: undefined, // Runtime error: passing undefined
      });

      app.log.info(`Successfully triggered rerun for workflow ${workflow_name || run_id}`, {
        status: rerunResponse.status,
        workflow_id: run_id
      });
      
      res.json({ 
        success: true,
        message: `Workflow has been queued for rerun`,
        workflow_id: run_id,
        workflow_name: workflow_name || "Unknown",
        repository: `${owner}/${repo}`,
        workflow_url: workflowUrl,
        github_response_status: rerunResponse.status
      });

    } catch (error) {
      app.log.error("Error rerunning workflow:", {
        workflow_id: req.body?.run_id,
        error: error.message,
        status: error.status,
        stack: error.stack
      });
      
      res.status(error.status || 500).json({ 
        error: "Failed to rerun workflow", 
        details: error.message,
        github_error: error.status ? true : false
      });
    }
  });

};