var serverurl = 'https://seeem-artenuvielle.c9.io';
var sendMouseMovementAfterMilliseconds = 10;
var cookiename = 'useridtest2';

var el1 = document.createElement('script');
el1.async = false;
el1.src = serverurl + '/public/js/swfobject-2.2.min.js';
el1.type = 'text/javascript';
(document.getElementsByTagName('HEAD')[0]||document.body).appendChild(el1);

if(!window.$) {
	var el2 = document.createElement('script');
	el2.async = false;
	el2.src = 'http://code.jquery.com/jquery-2.1.1.min.js';
	el2.type = 'text/javascript';
	(document.getElementsByTagName('HEAD')[0]||document.body).appendChild(el2);
}

var el3 = document.createElement('script');
el3.async = false;
el3.src = serverurl + '/public/js/evercookie.js';
el3.type = 'text/javascript';
(document.getElementsByTagName('HEAD')[0]||document.body).appendChild(el3);

var el4 = document.createElement('script');
el4.async = false;
el4.src = serverurl + '/public/js/primus.js';
el4.type = 'text/javascript';
(document.getElementsByTagName('HEAD')[0]||document.body).appendChild(el4);

function createCookieWhenEvercookieAndStuffIsLoaded() {
    if (window.evercookie && window.swfobject && window.$ && window.Primus){
        createCookie();
    } else {
        setTimeout(createCookieWhenEvercookieAndStuffIsLoaded, 50);
    }
}

createCookieWhenEvercookieAndStuffIsLoaded();

function createCookie(){
	ec = new evercookie({
		baseurl: serverurl,
		phpuri: '',
		asseturi: '/public/assets',
		java: false,
		silverlight: false
	});
	
	// retrieve a cookie called "id" (simply)
	ec.get(cookiename, function(value) {
		if(!value) {
			getNewUserID(function() {
				initPrimus();
			});
		} else {
			userid = customParse(value);
			ensureUser();
		}
	});
}

var ec;
var userid;
var primus;
var ensuredUser = false, connected = false, isConnectingForFirstTime = true;
var isTabVisible = true;

function getNewUserID(callback) {
	$.getJSON( serverurl + '/api/getuserid', function( data ) {
		userid = data.userid;
		ec.set(cookiename, '0'+userid);
		callback();
	});
}

function ensureUser() {
	$.post(serverurl + '/api/ensureuserid', { userid : userid }, function(response) {
		if(response.success) {
			ensuredUser = true;
			initPrimus();
		} else {
			getNewUserID(function() {
				initPrimus();
			});
		}
	}, 'json');
}

function sendTabState() {
	primus.write({ event : 'tabstatechanged', istabvisible : isTabVisible });
}

function initPrimus() {
	if(!userid) {
		console.log("ERROR: no userid");
		return;
	}
	primus = Primus.connect(serverurl, {
	  reconnect: {
	      maxDelay: Infinity // Number: The max delay for a reconnect retry.
	    , minDelay: 20 // Number: The minimum delay before we reconnect.
	    , retries: Infinity // Number: How many times should we attempt to reconnect.
	  }
	});
	primus.on('open', function(spark) {
		if(ensuredUser) {
			primus.write({ event : 'connect', userid : userid, location : window.location.href, tabid : makeid() });
			primus.writeAndWait('', function(err, res) {
				$.get('http://ipinfo.io/', function(response) {
					response.event = 'location';
				    primus.write(response);
				}, "jsonp");
				connected = true;
				if(isConnectingForFirstTime) initAfterFirstConnect();
				isConnectingForFirstTime = false;
			});
			ensuredUser = false;
		} else {
			connected = false;
			primus.end();
			ensureUser();
		}
	});
	window.onbeforeunload = endConnection;
}

function addEvent(obj, evt, fn) {
	if (obj.addEventListener) {
		obj.addEventListener(evt, fn, false);
	} else if (obj.attachEvent) {
		obj.attachEvent("on" + evt, fn);
	}
}

function initAfterFirstConnect() {
	$(document).mousemove((function() {
		var timer = null;
		
		return function(event) {
			if(connected) {
				if (timer === null) {
					timer = window.setTimeout(function() {
						window.clearTimeout(timer);
						timer = null;
					}, sendMouseMovementAfterMilliseconds);
					var mouse = {
						x: event.pageX,
						y: event.pageY
					};
					primus.write({ "event" : "mouse", "mousex" : mouse.x, "mousey" : mouse.y });
				}
			}
		}
	})());
	
	
	// fix mouseleave for latest chrome (sending mouseenter, leaver and enter again when hovering the tabs)
	var mouseintimer = null;
	$(document).mouseenter(function(evt) {
		mouseintimer = window.setTimeout(function() {
		    window.clearTimeout(mouseintimer);
		    mouseintimer = null;
		},50);
	});
	$(document).mouseleave(function(evt) {
	    if(evt.toElement === null && evt.relatedTarget === null && mouseintimer === null) {
	    	if(mouseintimer === null) {
				primus.write({ "event" : "mouse", "mousex" : null, "mousey" : null });
	    	} else {
			    window.clearTimeout(mouseintimer);
			    mouseintimer = null;
	    	}
	    }
	});
	
	
	// taken from http://stackoverflow.com/questions/1060008/is-there-a-way-to-detect-if-a-browser-window-is-not-currently-active
	(function() {
		var hidden = "hidden";
		
		// Standards:
		if (hidden in document)
			document.addEventListener("visibilitychange", onchange);
		else if ((hidden = "mozHidden") in document)
			document.addEventListener("mozvisibilitychange", onchange);
		else if ((hidden = "webkitHidden") in document)
			document.addEventListener("webkitvisibilitychange", onchange);
		else if ((hidden = "msHidden") in document)
			document.addEventListener("msvisibilitychange", onchange);
		// IE 9 and lower:
		else if ("onfocusin" in document)
			document.onfocusin = document.onfocusout = onchange;
		// All others:
		else
			window.onpageshow = window.onpagehide = window.onfocus = window.onblur = onchange;
		
		function onchange (evt) {
			var v = "visible", h = "hidden",
			evtMap = {
			  focus:v, focusin:v, pageshow:v, blur:h, focusout:h, pagehide:h
			};
			
			evt = evt || window.event;
			if (evt.type in evtMap)
				isTabVisible = (evtMap[evt.type] == "visible");
			else
				isTabVisible = ! this[hidden];
				
			sendTabState();
		}
		
		// set the initial state (but only if browser supports the Page Visibility API)
		if( document[hidden] !== undefined )
			onchange({type: document[hidden] ? "blur" : "focus"});
	})();
}

function endConnection()
{
	if(!primus) {
		console.log("ERROR: no primus");
		return;
	}
	primus.end();
}

function customParse(str) {
	var s = 0;
	for(var i=0;i<str.length;i++) {
		switch(str.charAt(i)) {
			case '0':
				break;
			case '1':
			case '2':
			case '3':
			case '4':
			case '5':
			case '6':
			case '7':
			case '8':
			case '9':
				s+=Math.pow(10,str.length - i - 1)*parseInt(str.charAt(i));
				break;
			default:
				return NaN;
		}
	}
	return s;
}

function makeid()
{
    var text = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    for( var i=0; i < 5; i++ )
        text += possible.charAt(Math.floor(Math.random() * possible.length));

    return text;
}