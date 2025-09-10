/**
 * Workflow event handlers for GitHub Actions
 * @param {import('probot').Probot} app
 */
export default (app) => {
  // Add workflow failure listener
  app.on("workflow_run.completed", async (context) => {
    const { workflow_run } = context.payload;
    
    // Only process failed workflows
    if (workflow_run.conclusion !== "failure") {
      return;
    }

    app.log.info(`Workflow failed: ${workflow_run.name} (#${workflow_run.id})`);

    try {
      // Get complete workflow data needed for rerunning
      const workflowData = {
        workflow_run: workflow_run,
        repository: context.payload.repository,
        sender: context.payload.sender,
        action: context.payload.action,
        // Get workflow jobs for detailed failure info
        jobs: await getWorkflowJobs(context, workflow_run.id),
        // Get workflow run attempts if any
        run_attempt: workflow_run.run_attempt,
        // Additional metadata for rerun
        rerun_data: {
          workflow_id: workflow_run.workflow_id,
          head_branch: workflow_run.head_branch,
          head_sha: workflow_run.head_sha,
          repository_full_name: context.payload.repository.full_name,
          owner: context.payload.repository.owner.login,
          repo: context.payload.repository.name
        }
      };

      // Send to Slack server endpoint
      await sendToSlackServer(app, workflowData);
      
      app.log.info(`Successfully sent failed workflow data for ${workflow_run.name} to Slack server`);
    } catch (error) {
      app.log.error("Error processing failed workflow:", {
        workflow_id: workflow_run.id,
        error: error.message,
        stack: error.stack
      });
    }
  });

  // Helper function to get workflow jobs
  async function getWorkflowJobs(context, workflowRunId) {
    try {
      const jobs = await context.octokit.actions.listJobsForWorkflowRun({
        ...context.repo(),
        run_id: workflowRunId,
      });
      
      return jobs.data.jobs.map(job => ({
        id: job.id,
        name: job.name,
        status: job.status,
        conclusion: job.conclusion,
        started_at: job.started_at,
        completed_at: job.completed_at,
        html_url: job.html_url,
        runner_id: job.runner_id,
        runner_name: job.runner_name,
        runner_group_id: job.runner_group_id,
        runner_group_name: job.runner_group_name,
        steps: job.steps?.map(step => ({
          name: step.name,
          status: step.status,
          conclusion: step.conclusion,
          number: step.number,
          started_at: step.started_at,
          completed_at: step.completed_at
        })) || []
      }));
    } catch (error) {
      app.log.warn(`Failed to get workflow jobs for run ${workflowRunId}:`, error.message);
      return [];
    }
  }

  // Helper function to send data to Slack server
  async function sendToSlackServer(app, workflowData) {
    const slackServerUrl = process.env.SLACK_SERVER;
    
    if (!slackServerUrl) {
      app.log.warn("SLACK_SERVER environment variable not set, skipping Slack notification");
      return;
    }

    const endpoint = `${slackServerUrl}/failed_workflow`;
    
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(workflowData)
      });

      if (!response.ok) {
        const responseText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, body: ${responseText}`);
      }

      app.log.info(`Successfully sent workflow failure data to ${endpoint}`);
    } catch (error) {
      app.log.error("Failed to send workflow data to Slack server:", error.message);
      throw error;
    }
  }
};