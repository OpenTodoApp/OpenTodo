// The task of create-task.js, renamed through the REST API.
var res = http.request(API + '/api/v1/tasks/' + output.taskId, {
  method: 'PATCH',
  headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: TITLE }),
})
if (!res.ok) throw new Error('rename task: ' + res.status + ' ' + res.body)
