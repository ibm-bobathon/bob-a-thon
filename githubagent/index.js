/**
 * This is the main entrypoint to your Probot app
 * @param {import('probot').Probot} app
 */
export default (app) => {
  app.log.info("Yay, the app was loaded!");

  app.on(
    ["pull_request.opened", "pull_request.synchronize"],
    async (context) => {
      const { pull_request } = context.payload;
      const { owner, repo } = context.repo();

      try {
        const diffResponse = await context.octokit.pulls.get({
          owner,
          repo,
          pull_number: pull_request.number,
          mediaType: {
            format: "diff",
          },
        });

        const diff = diffResponse.data;
        const firstChange = parseFirstChange(diff);

        if (firstChange) {
          await context.octokit.pulls.createReviewComment({
            owner,
            repo,
            pull_number: pull_request.number,
            body: "change made here",
            commit_id: pull_request.head.sha,
            path: firstChange.path,
            line: firstChange.line,
            side: "RIGHT",
          });

          app.log.info(
            `Added comment on first change in PR #${pull_request.number}`
          );
        }
      } catch (error) {
        app.log.error("Error processing pull request:", error);
      }
    }
  );

  function parseFirstChange(diff) {
    const lines = diff.split("\n");
    let currentFile = null;
    let lineNumber = 0;

    for (const line of lines) {
      if (line.startsWith("diff --git")) {
        const match = line.match(/diff --git a\/(.+) b\/(.+)/);
        if (match) {
          currentFile = match[2];
          lineNumber = 0;
        }
      } else if (line.startsWith("@@")) {
        const match = line.match(/@@ -\d+,?\d* \+(\d+),?\d* @@/);
        if (match) {
          lineNumber = parseInt(match[1]) - 1;
        }
      } else if (
        line.startsWith("+") &&
        !line.startsWith("+++") &&
        currentFile
      ) {
        lineNumber++;
        return {
          path: currentFile,
          line: lineNumber,
        };
      } else if (line.startsWith("-") && !line.startsWith("---")) {
        continue;
      } else if (
        !line.startsWith("\\") &&
        !line.startsWith("index ") &&
        currentFile
      ) {
        lineNumber++;
      }
    }

    return null;
  }
};
