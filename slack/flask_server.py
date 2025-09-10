import os
import json
from flask import Flask, request, jsonify
from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError

app = Flask(__name__)

slack_client = WebClient(token=os.environ.get("SLACK_BOT_TOKEN"))

@app.route('/failed_workflow', methods=['POST'])
def failed_workflow():
    try:
        json_data = request.get_json()
        if not json_data:
            return jsonify({"error": "No JSON data provided"}), 400
        
        # Extract key information from GitHub webhook
        workflow_run = json_data.get('workflow_run', {})
        repository = json_data.get('repository', {})
        jobs = json_data.get('jobs', [])
        
        workflow_name = workflow_run.get('name', 'Unknown Workflow')
        run_id = workflow_run.get('id', 'Unknown')
        owner = repository.get('owner', {}).get('login', 'Unknown')
        repo_name = repository.get('name', 'Unknown')
        workflow_url = workflow_run.get('html_url', '')
        
        # Check for PR information
        pull_requests = workflow_run.get('pull_requests', [])
        if pull_requests:
            pr_info = f"PR #{pull_requests[0].get('number', 'Unknown')} ({pull_requests[0].get('title', 'Unknown Title')})"
        else:
            # Fallback to commit info if no PR
            head_commit = workflow_run.get('head_commit', {})
            commit_msg = head_commit.get('message', 'Unknown commit').split('\n')[0]  # First line only
            pr_info = f"commit: {commit_msg[:50]}{'...' if len(commit_msg) > 50 else ''}"
        
        # Extract error details from failed jobs
        error_details = []
        for job in jobs:
            if job.get('conclusion') == 'failure':
                job_name = job.get('name', 'Unknown Job')
                failed_steps = [step for step in job.get('steps', []) if step.get('conclusion') == 'failure']
                if failed_steps:
                    step_names = [step.get('name', 'Unknown Step') for step in failed_steps]
                    error_details.append(f"• {job_name}: {', '.join(step_names)}")
                else:
                    error_details.append(f"• {job_name}: Failed")
        
        error_text = '\n'.join(error_details) if error_details else "Job failed (details not available)"
        
        # Create context JSON
        context_json = {
            "owner": owner,
            "repo": repo_name,
            "run_id": run_id,
            "workflow_name": workflow_name
        }
        
        # Format the Slack message
        message_blocks = [
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"🚨 *NOTIFICATION:*\n\nWorkflow *{workflow_name}* on {pr_info} just failed.\n\n*Error details:*\n{error_text}\n\n```json\n{json.dumps(context_json, indent=2)}\n```\n\n✅ I have already viewed the PR and provided comments."
                }
            },
            {
                "type": "actions",
                "elements": [
                    {
                        "type": "button",
                        "text": {
                            "type": "plain_text",
                            "text": "Analyze the failure"
                        },
                        "style": "primary",
                        "url": f"https://github.com/{owner}/{repo_name}/actions/runs/{run_id}",
                        "value": json.dumps(context_json),
                        "action_id": "analyze_failure"
                    },
                    {
                        "type": "button",
                        "text": {
                            "type": "plain_text",
                            "text": "Rerun"
                        },
                        "value": json.dumps(context_json),
                        "action_id": "rerun_workflow"
                    }
                ]
            }
        ]
        
        response = slack_client.chat_postMessage(
            channel="C09EFA8TM8V",
            text=f"Workflow {workflow_name} failed",
            blocks=message_blocks
        )
        
        return jsonify({"success": True, "message": "Failure notification sent"}), 200
        
    except SlackApiError as e:
        return jsonify({"error": f"Slack API error: {e.response['error']}"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)