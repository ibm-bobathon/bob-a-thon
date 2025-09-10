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

        // Format the diff as LLM-readable markdown
        const markdownFormattedDiff = formatDiffAsMarkdown(
          rawDiff,
          pull_request
        );

        // Transmit the formatted diff to the internal endpoint and get LLM response
        const llmResponse = await sendDiffToEndpoint(
          markdownFormattedDiff,
          pull_request,
          app
        );

        if (
          llmResponse &&
          llmResponse.comments &&
          llmResponse.comments.length > 0
        ) {
          // Create inline comments based on LLM response
          await createInlineComments(
            context,
            llmResponse.comments,
            pull_request,
            app
          );
          app.log.info(
            `Successfully processed PR #${pull_request.number} and created ${llmResponse.comments.length} comments`
          );
        } else {
          app.log.info(
            `Successfully processed PR #${pull_request.number} but received no valid comments from LLM`
          );
        }
      } catch (error) {
        app.log.error("Error processing pull request:", {
          pr: pull_request.number,
          error: error.message,
          stack: error.stack,
        });
      }
    }
  );

  /**
   * Format the raw diff as LLM-readable markdown
   * @param {string} rawDiff - The raw diff string from GitHub
   * @param {object} pullRequest - The pull request object
   * @returns {string} - Markdown formatted diff
   */
  function formatDiffAsMarkdown(rawDiff, pullRequest) {
    const markdownDiff = `# Pull Request Diff

**Repository:** ${pullRequest.base.repo.full_name}
**PR Number:** #${pullRequest.number}
**Title:** ${pullRequest.title}
**Author:** ${pullRequest.user.login}
**Base Branch:** ${pullRequest.base.ref}
**Head Branch:** ${pullRequest.head.ref}

## Diff Content

\`\`\`diff
${rawDiff}
\`\`\`
`;

    return markdownDiff;
  }

  /**
   * Send the formatted diff to the internal endpoint and handle LLM response
   * @param {string} formattedDiff - The markdown formatted diff
   * @param {object} pullRequest - The pull request object
   * @param {object} logger - The app logger
   */
  async function sendDiffToEndpoint(formattedDiff, pullRequest, logger) {
    const endpoint =
      process.env.INTERNAL_ENDPOINT ||
      `http://localhost:${process.env.PORT || 3000}/pull_request`;

    const payload = {
      diff_content: formattedDiff,
      metadata: {
        repository: pullRequest.base.repo.full_name,
        pr_number: pullRequest.number,
        title: pullRequest.title,
        author: pullRequest.user.login,
        base_branch: pullRequest.base.ref,
        head_branch: pullRequest.head.ref,
        head_sha: pullRequest.head.sha,
        created_at: pullRequest.created_at,
        updated_at: pullRequest.updated_at,
      },
    };

    try {
      logger.info(`Sending diff to endpoint: ${endpoint}`);

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "GitHub-PR-Diff-Bot/1.0",
        },
        body: JSON.stringify(payload),
      }).catch((fetchError) => {
        logger.error("Fetch error details:", {
          message: fetchError.message,
          code: fetchError.code,
          cause: fetchError.cause,
        });
        throw fetchError;
      });

      if (!response.ok) {
        // For now, if the endpoint is not available, return stub data
        if (response.status === 404 || response.status >= 500) {
          logger.warn(
            `Endpoint not available (${response.status}), using stub data`
          );
          return getStubLLMResponse();
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const responseText = await response.text();
      logger.info(
        `Received response from endpoint, length: ${responseText.length} characters`
      );

      // Parse and validate the LLM response
      const llmResponse = parseLLMResponse(responseText, logger);
      return llmResponse;
    } catch (error) {
      logger.error("Error communicating with endpoint:", {
        endpoint,
        error: error.message,
        errorName: error.name,
        errorCode: error.code,
        pr: pullRequest.number,
        stack: error.stack,
      });

      // Fallback to stub data if endpoint fails
      logger.info("Falling back to stub data due to endpoint error");
      return getStubLLMResponse();
    }
  }

  /**
   * Parse and validate the LLM response JSON
   * @param {string} responseText - The raw response text from the endpoint
   * @param {object} logger - The app logger
   * @returns {object|null} - Parsed and validated response or null if invalid
   */
  function parseLLMResponse(responseText, logger) {
    try {
      const parsedResponse = JSON.parse(responseText);

      // Validate the response structure
      if (!parsedResponse || typeof parsedResponse !== "object") {
        throw new Error("Response is not a valid object");
      }

      if (!Array.isArray(parsedResponse.comments)) {
        throw new Error("Response does not contain a valid comments array");
      }

      // Validate each comment object
      for (let i = 0; i < parsedResponse.comments.length; i++) {
        const comment = parsedResponse.comments[i];

        if (!comment.path || typeof comment.path !== "string") {
          throw new Error(`Comment ${i}: 'path' must be a non-empty string`);
        }

        if (!Number.isInteger(comment.line) || comment.line < 1) {
          throw new Error(`Comment ${i}: 'line' must be a positive integer`);
        }

        if (!comment.body || typeof comment.body !== "string") {
          throw new Error(`Comment ${i}: 'body' must be a non-empty string`);
        }
      }

      logger.info(
        `Validated LLM response with ${parsedResponse.comments.length} comments`
      );
      return parsedResponse;
    } catch (error) {
      logger.error("Error parsing LLM response:", {
        error: error.message,
        responsePreview: responseText.substring(0, 200),
      });
      return null;
    }
  }

  /**
   * Get stub LLM response for testing
   * @returns {object} - Stub response with sample comments
   */
  function getStubLLMResponse() {
    return {
      comments: [
        {
          path: "src/app.js",
          line: 15,
          body: "Consider adding error handling for this API call.",
        },
        {
          path: "README.md",
          line: 5,
          body: "Could you please add a link to the documentation here?",
        },
      ],
    };
  }

  /**
   * Create inline comments on the pull request based on LLM response
   * @param {object} context - The GitHub context object
   * @param {array} comments - Array of comment objects from LLM
   * @param {object} pullRequest - The pull request object
   * @param {object} logger - The app logger
   */
  async function createInlineComments(context, comments, pullRequest, logger) {
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < comments.length; i++) {
      const comment = comments[i];

      try {
        logger.info(
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
