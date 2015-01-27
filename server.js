var ip = process.env.IP;
var port = process.env.PORT;

var url = require('url'),
  express = require('express'),
  cors = require('cors'),
  cookieParser = require('cookie-parser'),
  evercookie = require('evercookie'),
  mysql = require('mysql'),
  Primus = require('primus'),
  PrimusCallbacks = require('primus-callbacks'),
  useragent = require('useragent');;

var app = express();
app.use(cors());

var http_server = require('http').createServer(app);
var primus = new Primus(http_server, { transformer: 'websockets' });
primus.use('callbacks', PrimusCallbacks);
primus.save(__dirname +'/public/js/primus.js');

app.use(cookieParser());
app.use(evercookie.backend());
app.use(cookieParser());
app.use('/public', express.static(__dirname + '/public')); // be careful, you may want to use path.join instead!

var mysql_connection = mysql.createConnection({
    host: "localhost",
    user: "artenuvielle",
    password: ""
});

mysql_connection.connect();

mysql_connection.query('USE c9');
mysql_connection.query('DROP TABLE IF EXISTS sessions');
mysql_connection.query('DROP TABLE IF EXISTS user');
mysql_connection.query('CREATE TABLE user (\
  userid INT(6) UNSIGNED AUTO_INCREMENT PRIMARY KEY,\
  ip varchar(20),\
  osfamily varchar(255),\
  osversionmajor INT(6) UNSIGNED,\
  osversionminor INT(6) UNSIGNED,\
  osversionpatch INT(6) UNSIGNED,\
  device varchar(255),\
  browserfamily varchar(255),\
  browserversionmajor INT(6) UNSIGNED,\
  browserversionminor INT(6) UNSIGNED,\
  browserversionpatch INT(6) UNSIGNED,\
  isMobile boolean\
)');
mysql_connection.query('CREATE TABLE sessions (\
  sessid INT(6) UNSIGNED AUTO_INCREMENT PRIMARY KEY,\
  userid INT(6) UNSIGNED NOT NULL,\
  tabid varchar(20),\
  location varchar(255),\
  mousex INT(6) UNSIGNED DEFAULT NULL,\
  mousey INT(6) UNSIGNED DEFAULT NULL,\
  city varchar(255),\
  country varchar(255),\
  hostname varchar(255),\
  loc varchar(255),\
  org varchar(255),\
  region varchar(255),\
  postal varchar(10),\
  istabvisible boolean,\
  sessionstart TIMESTAMP DEFAULT \'0000-00-00 00:00:00\',\
  lastupdated TIMESTAMP DEFAULT now() ON UPDATE now(),\
  UNIQUE (userid, tabid),\
  FOREIGN KEY (userid) REFERENCES user(userid) ON DELETE CASCADE ON UPDATE CASCADE\
)');

function insertUserDataIntoDatabase(req, userid, callback) {
  var info = { ip : req.connection.remoteAddress };
    
  var agent = useragent.lookup(req.headers['user-agent'], req.query.jsuseragent);
    
  info.browserfamily = agent.family;
  info.browserversionmajor = parseInt(agent.major);
  info.browserversionminor = parseInt(agent.minor);
  info.browserversionpatch = parseInt(agent.patch);
  
  info.device = agent.device.family;
  
  info.osfamily = agent.os.family;
  info.osversionmajor = parseInt(agent.os.major);
  info.osversionminor = parseInt(agent.os.minor);
  info.osversionpatch = parseInt(agent.os.patch);
  
  if(userid) info.userid = userid;
  
  mysql_connection.query('INSERT INTO user SET ?', info, callback);
}

app.get('/api/getuserid', express.bodyParser(), function(req, res){
  insertUserDataIntoDatabase(req, null, function(err, rows, fields) {
    if (err) throw err;
    mysql_connection.query('SELECT userid FROM user WHERE userid = LAST_INSERT_ID()', function(err, rows, fields) {
      if (err) throw err;
        res.json({ userid : rows[0].userid });
        console.log('new user id: ', rows);
    });
  });
});

app.post('/api/ensureuserid', express.bodyParser(), function(req, res){
  // After a server restart we expect users to connect with the same id as before
  // It gets tricky when different useres expect to have the same key which can
  // happen if a user gets an id, the server is restarted and another user receives
  // the same id. 
  insertUserDataIntoDatabase(req, req.body.userid, function(err, rows, fields) {
    if (err) {
      // when a user exist and he got a session on another ip tell the client to receive a new userid
      mysql_connection.query('SELECT * FROM user, sessions WHERE user.userid = sessions.userid AND ip != \'' + req.connection.remoteAddress + '\' AND user.userid = ' + req.body.userid, function(err, rows, fields) {
        if (err) throw err;
        if(rows.length > 0) {
          res.json({ success:false });
          console.log('taken userid requested: ', req.body.userid);
          return;
        }
        // if there are no rows either a second user with the same user id connected
        // or a user connects from a different position
      });
    }
    // if inserting user was successful we can let the user have his id
    mysql_connection.query('UPDATE user SET ip = \'' + req.connection.remoteAddress + '\' WHERE userid = ' + req.body.userid, function(err, rows, fields) {
      if (err) throw err;
      res.json({ success:true });
      console.log('userid reentered: ', req.body.userid);
    });
  });
});

primus.on('connection', function (socket) {
  
  var userid, tabid, sid, connecting = false;
  
  // Handle incoming requests:
  socket.on('request', function(data, done) {
    var i = 100;
    var sleepFunction = function() {
      if(connecting && i > 0) {
        i--;
        setTimeout(sleepFunction(), 100);
      }
    }
    sleepFunction();
    done(null, null);
  });
  
  socket.on('data', function ping(message) {
    // it would be better to create a second primus on a different port but cloud9
    // IDE limits us to only one port. Therefore we expect a type parameter only
    // from dashboards.
    if(message['type'] && message['type'] == 'dashboardconnect') {
      registeredDashboardSockets.push(socket.id)
      mysql_connection.query('SELECT * FROM sessions, user WHERE user.userid = sessions.userid', function(err, rows, fields) {
          if(err) throw err;
          for(var i = 0; i < rows.length; i++) {
            socket.write({ event: 'newsession', sid:  rows[i].sessid, data: rows[i] });
          }
      });
      console.log('Dashboard connected');
      
      socket.on('end', function() {
        var index = registeredDashboardSockets.indexOf(socket.id);
        registeredDashboardSockets = registeredDashboardSockets.slice(index,1);
        console.log('Dashboard disconnected');
      });
      
      return;
    }
    
    console.log('received a new message: ', message);
    if(!message['event']) {
      console.log('received websocket message without eventtype');
    } else {
      switch(message['event']) {
        case 'connect':
          connecting = true;
          userid = message['userid'];
          tabid = message['tabid'];
          
          mysql_connection.query('INSERT INTO sessions (userid, tabid, location, sessionstart) VALUES ( ' + userid + ', \'' + tabid + '\', \'' + message['location'] + '\', null)', function(err, rows, fields) {
            if (err) throw err;
            
            mysql_connection.query('SELECT sessid FROM sessions WHERE userid = ' + userid + ' AND tabid = \'' + tabid + '\'', function(err, rows, fields) {
              if (err) throw err;
              sid = rows[0].sessid;
              connecting = false;
              onSessionConnected(sid);
            });
            
            socket.on('end', function () {
              if(sid) {
                mysql_connection.query('DELETE FROM sessions WHERE sessid = ' + sid);
              }
              
              console.log('Session closed: ' + sid);
              
              onSessionEnded(sid);
            });
          });
          break;
        case 'mouse':
          if(sid) {
            var info = clone(message);
            delete info.event;
            mysql_connection.query('UPDATE sessions SET ? WHERE sessid = ' + sid, info);
            onSessionUpdated(sid, message['event']);
          }
          break;
        case 'location':
          if(sid) {
            var info = clone(message);
            delete info.event;
            delete info.ip;
            mysql_connection.query('UPDATE sessions SET ? WHERE sessid = ' + sid, info);
            onSessionUpdated(sid, message['event']);
          }
          break;
        case 'tabstatechanged':
          if(sid) {
            var info = clone(message);
            delete info.event;
            mysql_connection.query('UPDATE sessions SET ? WHERE sessid = ' + sid, info);
            onSessionUpdated(sid, message['event']);
          }
          break;
        default:
          console.log('requested unknown event type');
      }
    }
  });
});

var registeredDashboardSockets = [];
function onSessionConnected(sid) {
  registeredDashboardSockets.map(function(socketid) {
    mysql_connection.query('SELECT * FROM user, sessions WHERE user.userid = sessions.userid AND sessions.sessid = ' + sid, function(err, rows, fields) {
      if(err) throw err;
      var socket = primus.spark(socketid);
      if (socket) {
        socket.write({ event: 'newsession', sid: sid, data: rows[0] });
      }
    });
  });
}

function onSessionEnded(sid) {
  registeredDashboardSockets.map(function(socketid) {
    var socket = primus.spark(socketid);
    if (socket) {
      socket.write({ event: 'endsession', sid: sid });
    }
  });
}

function onSessionUpdated(sid, originalevent) {
  registeredDashboardSockets.map(function(socketid) {
    mysql_connection.query('SELECT * FROM sessions WHERE sessions.sessid = ' + sid, function(err, rows, fields) {
      if(err) throw err;
      var socket = primus.spark(socketid);
      if (socket) {
        socket.write({ event: 'updatesession', originalevent: originalevent, sid: sid, data: rows[0] });
      }
    });
  });
}

http_server.listen(port,function(err) {
	if(err)	throw err;
	console.info('Listening on %s', port);
});

function clone(obj) {
  if (null === obj || "object" != typeof obj) return obj;
  var copy = obj.constructor();
  for (var attr in obj) {
    if (obj.hasOwnProperty(attr)) copy[attr] = obj[attr];
  }
  return copy;
}