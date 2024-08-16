// XXX even though ethers is not used in the code below, it's very likely
// it will be used by any DApp, so we are already including it here
const { ethers } = require("ethers");

const rollup_server = process.env.ROLLUP_HTTP_SERVER_URL;
console.log("HTTP rollup_server url is " + rollup_server);

function hextoString(hexx) {
  return ethers.toUtf8String(hexx);
}

function stringtoHex(payload) {
  return ethers.hexlify(ethers.toUtf8Bytes(payload));
}

// Task storage
let tasks = {}; // stores tasks with their ID as the key
let taskCount = 0; // counts the total number of tasks

async function handle_advance(data) {
  const payload = data["payload"];
  let command = hextoString(payload);
  
  // Parse the command and perform actions
  const [action, taskId, taskDescription] = command.split(':');
  
  if (action === "create") {
    // Create a new task
    taskCount += 1;
    tasks[taskCount] = { id: taskCount, description: taskDescription, status: "pending" };
    const message = `Task created with ID: ${taskCount}`;
    await fetch(rollup_server + "/notice", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ payload: stringtoHex(message) }),
    });
    return "accept";
  } else if (action === "update") {
    // Update an existing task
    if (tasks[taskId]) {
      tasks[taskId].description = taskDescription;
      const message = `Task ${taskId} updated`;
      await fetch(rollup_server + "/notice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ payload: stringtoHex(message) }),
      });
      return "accept";
    } else {
      const message = `Task ${taskId} not found`;
      await fetch(rollup_server + "/report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ payload: stringtoHex(message) }),
      });
      return "reject";
    }
  } else if (action === "complete") {
    // Mark task as completed
    if (tasks[taskId]) {
      tasks[taskId].status = "completed";
      const message = `Task ${taskId} marked as completed`;
      await fetch(rollup_server + "/notice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ payload: stringtoHex(message) }),
      });
      return "accept";
    } else {
      const message = `Task ${taskId} not found`;
      await fetch(rollup_server + "/report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ payload: stringtoHex(message) }),
      });
      return "reject";
    }
  } else {
    const message = "Unknown action";
    await fetch(rollup_server + "/report", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ payload: stringtoHex(message) }),
    });
    return "reject";
  }
}

async function handle_inspect(data) {
  const payload = data["payload"];
  const route = hextoString(payload);

  let responseObject = {};

  if (route === "allTasks") {
    responseObject = JSON.stringify({ tasks });
  } else if (route.startsWith("taskDetails:")) {
    const taskId = route.split(":")[1];
    if (tasks[taskId]) {
      responseObject = JSON.stringify({ task: tasks[taskId] });
    } else {
      responseObject = JSON.stringify({ error: `Task ${taskId} not found` });
    }
  } else if (route === "taskCount") {
    responseObject = JSON.stringify({ taskCount });
  } else {
    responseObject = "Route not implemented";
  }

  await fetch(rollup_server + "/report", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ payload: stringtoHex(responseObject) }),
  });

  console.log("Received inspect request data " + JSON.stringify(data));
  return "accept";
}

var handlers = {
  advance_state: handle_advance,
  inspect_state: handle_inspect,
};

var finish = { status: "accept" };

(async () => {
  while (true) {
    const finish_req = await fetch(rollup_server + "/finish", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "accept" }),
    });

    console.log("Received finish status " + finish_req.status);

    if (finish_req.status == 202) {
      console.log("No pending rollup request, trying again");
    } else {
      const rollup_req = await finish_req.json();
      var handler = handlers[rollup_req["request_type"]];
      finish["status"] = await handler(rollup_req["data"]);
    }
  }
})();

