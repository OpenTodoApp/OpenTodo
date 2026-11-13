// The task completed in the app is completed on the server, within the sync debounce.
var done = null
for (var i = 0; i < 40 && !done; i++) {
  var res = http.get(API + '/api/v1/tasks/' + output.taskId, { headers: { Authorization: 'Bearer ' + TOKEN } })
  if (!res.ok) throw new Error('read task: ' + res.status + ' ' + res.body)
  done = json(res.body).completed_at
  // No sleep in Maestro's scripts: a slow request is the wait.
  if (!done) http.get(API + '/api/v1/health')
}
if (!done) throw new Error('the task is not completed on the server')
