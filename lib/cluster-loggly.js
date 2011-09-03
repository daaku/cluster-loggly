var loggly = require('loggly')
  , sprintf = require('format').sprintf

function makeLog(config) {
  var client = loggly.createClient(config)
    , token = config.token
  return function(line) {
    if (!line) return
    if (line instanceof Buffer) line = line.toString('utf8')
    client.log(token, line, function(er, result) {
      if (er) return console.error('loggly error', er)
    })
  }
}

module.exports = function(config) {
  var log = makeLog(config)
  return function(master) {
    master.on('start', log.bind(null, 'master started'))
    master.on('closing', log.bind(null, 'shutting down master'))
    master.on('close', log.bind(null, 'shutdown complete'))

    master.on('kill', function(sig) {
      log(sprintf('sent kill(%s) to all workers', sig))
    })

    // worker was killed
    master.on('worker killed', function(worker) {
      if ('restarting' == master.state) return
      log(sprintf('worker %s died', worker.id))
    })

    // worker exception
    master.on('worker exception', function(worker, err) {
      log(sprintf('worker %s uncaught exception %s', worker.id, err.message))
    })

    // worker is waiting on connections to be closed
    master.on('worker waiting', function(worker, connections) {
      log(sprintf('worker %s waiting on %s connections', worker.id, connections))
    })

    // worker has timed out
    master.on('worker timeout', function(worker, timeout) {
      log(sprintf('worker %s timed out after %sms', worker.id, timeout))
    })

    // worker connected to master
    master.on('worker connected', function(worker) {
      log(sprintf('worker %s connected', worker.id))
    })

    // cyclic or immediate restart
    master.on('cyclic restart', function() {
      log(sprintf('cyclic restart detected, restarting in %sms'
        , master.options['restart timeout']))
    })

    // restart requested
    master.on('restarting', function() {
      log('restart requested')
    })

    // restart complete
    master.on('restart', function() {
      log('restart complete')
    })

    // repl socket connection established
    master.on('repl socket', function(sock) {
      var from = sock.remoteAddress
        ? 'from ' + sock.remoteAddress
        : ''
      sock.on('connect', function() {
        log(sprintf('repl connection %s', from))
      })
      sock.on('close', function() {
        log(sprintf('repl disconnect %s', from))
      })
    })

    // override fds
    master.customFds = [-1, -1]

    // children
    master.on('worker', function(worker) {
      log(sprintf('spawned worker %s', worker.id))
      var proc = worker.proc
      proc.stdout.on('data', log)
      proc.stderr.on('data', log)
    })
  }
}
