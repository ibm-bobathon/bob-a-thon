import logging
import json
import requests
logging.basicConfig(level=logging.DEBUG)

from slack_bolt import App

app = App()

@app.action("rerun_workflow")
def handle_rerun_workflow(ack, body, respond):
    """Handle Rerun workflow button click"""
    ack()
    user = body["user"]["id"]
    
    try:
        # Get the workflow context from button value
        button_value = body["actions"][0]["value"]
        workflow_context = json.loads(button_value)

        print(f"BABABABBAbABAB Rerun workflow context: {workflow_context}")
        
        # Make POST request to workflow-rerun endpoint
        response = requests.post(
            "http://localhost:3000/workflow-rerun",
            json=workflow_context,
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code == 200:
            respond(
                text=f"<@{user}> initiated a workflow rerun for *{workflow_context.get('workflow_name', 'Unknown')}* ✅",
                blocks=[
                    {
                        "type": "section",
                        "text": {
                            "type": "mrkdwn",
                            "text": f"<@{user}> initiated a workflow rerun for *{workflow_context.get('workflow_name', 'Unknown')}* ✅\n\nWorkflow rerun request sent successfully!"
                        }
                    }
                ],
                replace_original=True
            )
        else:
            respond(
                text=f"<@{user}> tried to rerun workflow but it failed ❌",
                blocks=[
                    {
                        "type": "section",
                        "text": {
                            "type": "mrkdwn",
                            "text": f"<@{user}> tried to rerun workflow but it failed ❌\n\nError: HTTP {response.status_code}"
                        }
                    }
                ],
                replace_original=True
            )
            
    except Exception as e:
        logging.error(f"Error handling rerun workflow: {e}")
        respond(
            text=f"<@{user}> tried to rerun workflow but an error occurred ❌",
            blocks=[
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f"<@{user}> tried to rerun workflow but an error occurred ❌\n\nError: {str(e)}"
                    }
                }
            ],
            replace_original=True
        )

if __name__ == "__main__":
    app.start(4000)

