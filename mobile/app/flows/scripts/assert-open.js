// The task of create-task.js (the last one made) is not completed on the server, once
// sync has had the time to send whatever the app wrote.
for (var i = 0; i < 12; i++) http.get(API + '/api/v1/health')
var res = http.get(API + '/api/v1/tasks/' + output.taskId, { headers: { Authorization: 'Bearer ' + TOKEN } })
if (!res.ok) throw new Error('read task: ' + res.status + ' ' + res.body)
if (json(res.body).completed_at) throw new Error('the task is completed on the server')
