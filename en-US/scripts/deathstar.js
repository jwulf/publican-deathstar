var flash, originalTitle, bookmd, socketConnected = false, NO_FLASH = false, retries, beenConnected;

function url_query( query, url ) {
  // Parse URL Queries
  // from http://www.kevinleary.net/get-url-parameters-javascript-jquery/
  // Will parse the current window location if not passed a url
	query = query.replace(/[\[]/,"\\\[").replace(/[\]]/,"\\\]");
	var expr = "[\\?&]"+query+"=([^&#]*)";
	var regex = new RegExp( expr );
	var results = regex.exec( url) || regex.exec( window.location.href );
	if( results !== null ) {
		return results[1];
		return decodeURIComponent(results[1].replace(/\+/g, " "));
	} else {
		return false;
	}
}

function deathstarItUp()
{
    var editorURL, injectorURL, buildData, endLoc, topicID;
    
    retries = 0;
    beenConnected = false;
    originalTitle = document.title;
    connectSocket();

    getBookmd();
    
    $('.notifier').click(clearNotifier);
}

function disconnectedNotifier () {
    var _text;
    if (!socketConnected) {
        retries ++;
        displayNotification('Attempting to contact server... lost connection ' + (retries * 5) + ' seconds ago', NO_FLASH);
        setTimeout(disconnectedNotifier, 5000); // retry the socket connection every 1 second    
    } else {
        _text = $('.notifier').html();
        if (_text.indexOf('Attempting to contact') != -1 || _text.indexOf('Lost connection to server') != -1) 
            clearNotifier();
    }
}

function connectSocket () {
    var socket;
    
    // This code handles disconnection events (for example a server bounce, or the client switching networks)
    if (! socketConnected) {
        if (!beenConnected) {
            socket = io.connect(); 
        
            socket.on('connect', function () { // TIP: you can avoid listening on `connect` and listen on events directly too!
                socketConnected = true;
                if (retries > 0) clearNotifier();
                retries = 0;
                beenConnected = true;
                console.log('Websocket connected to server');
                socket.emit('patchSubscribe', {skynetURL: skynetURL, id: thisBookID});
                
                socket.on('disconnect', function () { 
                    displayNotification('Lost connection to server...', NO_FLASH);
                    setTimeout(disconnectedNotifier, 5000); 
                    socketConnected = false;
                    retries = 0;
                });
            });
            
            /* 
             
            */
            
            socket.on('patchBookinBrowser', patchTopic);
            socket.on('bookRebuiltNotification', bookRebuiltNotification); 
            socket.on('notification', routeNotification);
            
            /* State change is sent every time the book's metadata structure changes on the
             server. It is used to update client-side views of building / publishing / error status
             
             The Death Star Control Panel uses client-side Embedded JavaScript Templating in 
             conjunction with this event to maintain a real-time view of the book's activity on the
             server.
             */
             
            socket.on('statechange', processStateChange);
        }
    }
}

function processStateChange(data) {
    if (data.md)    
        updateControlPanel(data.md);
}

function getBookmd () {
    $.get('/rest/1/getBookmd', {url: skynetURL, id: thisBookID},
        function (result) {
            updateControlPanel(result);
    });  
}

function updateControlPanel (md) {
    new EJS({url: 'Common_Content/scripts/control-panel.ejs'}).update('ds-control-panel', {bookmd: md}); 
    
    $('#rebuild-link').click(clickBuild);
    $('#edit-structure').click(clickEditStructure);
    $('#click-publish').click(clickPublish);
    $('#go-home').click(clickGoHome);
}

function clickGoHome (e) {
    e.preventDefault();
    window.open('/', '_deathstar'); 
    return false;    
}

function routeNotification (data) {
    if (data.buildnotification) {
        buildNotification(data); 
    } else {
        displayNotification(data);
    }
}

function buildNotification (data) {
    $('#rebuild-link').html(data.msg);    
    if (data.blink) {
        $('#rebuild-link').addClass('css3-blink');
    } else {
        $('#rebuild-link').removeClass('css3-blink');
    }
}

function clickBuild (e) {
    e.preventDefault();
    if (e) {
        var url = $(this).attr('rel');    
    
        if ( url == 'rebuild') {
            $.get('/rest/1/build', {url: skynetURL, id: thisBookID}, function (result){
                console.log(result);
                return false;
            });
        } else if ( url == 'reload' ) {
            reload() 
        } else {
         window.open(url, '_blank');
         return false;
        }
    }
}

function clickPublish (e) {
    var _url, _target;
    
    e.preventDefault();
    _target = '_blank';
    _url = $(this).attr('rel');

    if (_url == '/publish') _target = '_deathstar';
    
    window.open(_url, _target);
    return false;
}

function clickEditStructure (e) {
    e.preventDefault();
    window.open('/cspec-editor.html?skyneturl=' + skynetURL + '&topicid=' + thisBookID);
    return false;
}

function displayNotification (data, flash) {
    var _flash, _msg, _title = 'Notification';
    
    if ("string" == typeof data) _msg = data;
    if ("object" == typeof data) {
        _msg = data.msg;
        if (data.title) _title = data.title;
    }
    
    _flash = (flash !== false); // means true unless flash is really set to false, not just null
    
   if (_flash) flashTitle(_title);
   
   $('.notifier').html(_msg);
   $('.notifier').removeClass('invisible');
}

function clearNotifier () {
    clearInterval(flash);
    document.title = originalTitle;
    $('.notifier').addClass('invisible');
    return true;
}

function flashTitle (msg) {

    flash = setInterval(function () { 
        document.title = (document.title == originalTitle) ? msg : originalTitle; 
        }, 500);    
}

function bookRebuiltNotification () {
    flashTitle('Updated');
    $('.notify-rebuilt').removeClass('invisible');   
    $('#rebuild-link').attr('rel', 'reload');
    $('#rebuild-link').html('Reload');
}

function reload () {
    location.reload(true);
}

// Invoked via websocket from the server
function patchTopic (msg) {
    var target;
    console.log('Received patch for Topic ' + msg.topicID);
    if (msg.topicID && msg.html) {
        
        $('.sectionTopic' + msg.topicID).each(function(){
             // Locate the sectionTopic
            var target = $(this);
        
            // Locate and preserve its .prereqs-list child, if it exists
            var prereq = target.children('.prereqs-list').detach();
            
            // Locate and preserve its .see-also-list child, if it exists
            var seealso = target.children('.see-also-list').detach();
            
            // Locate and preserve the bug link / edit child
            var buglink = target.children('.bug-link').detach();
            
            // Get the title from the existing topic - this gets us the TOC anchor and correct section number
            var title = target.find('.title')[0];
            
            // Update the content
            target.html(msg.html);
            
            // Now replace the title to get the TOC anchor and the correct section numbering
            $(target.find('.title')[0]).replaceWith(title);
            
            // Update the revision information stored in the css
              // http://stackoverflow.com/questions/2644299/jquery-removeclass-wildcard
            target.removeClass(function (index, css) {
                return (css.match (/\bpg-topic-rev\S+/g) || []).join(' ');    
            }); // get rid of previous revision information
            
            target.addClass('pg-topic-rev-' + revision); // Add current revision
            
            // Restore injected content
            if (prereq) prereq.insertAfter(target.find('hr'));
            if (seealso) seealso.appendTo(target);
            if (buglink) buglink.appendTo(target);   
        });
            
    }    
}
    
