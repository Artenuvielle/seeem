See'em
======

See'em is a web service which provides a JavaScript file for monitoring users from different websites. The service itself is build for node.js and requires a MySQL database for storing user data and some plugins for node.js.

To install use:
    npm install seeem

What can be monitored?
----------------------

Everything which can be read by JavaScript running on the clients browser and also all data which is parsed upon HTTP-Requests to the server. Currently the following data is being gathered:
* OS type and version
* Browser type and version
* Geo-data gathered by http://ipinfo.io/
* URL of calling website
* Connecting and disconnecting
* Mouse position and browser tab state

All of this data is send to the server and can be displayed in realtime on the dashboard.


Additional Information
----------------------

This project was developed for pure functionality and with no respect of coding style or maintainability.