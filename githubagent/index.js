import listeners from "./listeners.js";

/**
 * This is the main entrypoint to your Probot app
 * @param {import('probot').Probot} app
 */
export default (app, { getRouter }) => {
  app.log.info("GitHub PR Diff Forwarder Bot loaded!");

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
          {
            path: "githubagent/README.md",
            line: 5,
            body: "📝 LLM Suggestion: Could you please add a link to the documentation here?",
          },
        ],
      };

      app.log.info(
        `Returning stub response with ${stubResponse.comments.length} comments`
      );
      res.json(stubResponse);
    } catch (error) {
      app.log.error("Error in /pull_request endpoint:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Load pull request listeners
  listeners(app);
};
