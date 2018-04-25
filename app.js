var express = require('express');
var path = require('path');
var morgan = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var mysql = require('mysql');
var fs = require('fs');
var config = require("./config");
var app = express();
var accessLogStream = fs.createWriteStream(path.join(__dirname, 'access.log'), {flags: 'a'});

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.set('port', (process.env.PORT || 80 ));
// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use(morgan('combined', {stream: accessLogStream}));
app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());


app.use(function (req, res, next) {

    res.setHeader('Access-Control-Allow-Origin', '*');
    // Request methods you wish to allow
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');

    // Request headers you wish to allow
    res.setHeader('Access-Control-Allow-Headers', '*');

    // Set to true if you need the website to include cookies in the requests sent
    // to the API (e.g. in case you use sessions)
    res.setHeader('Access-Control-Allow-Credentials', false);

    if (req.method === 'OPTIONS') {
        res.send(200);
    } else {
        next();
    }
    // Pass to next layer of middleware
});

var pool = mysql.createPool({
    host: config.db.host,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database
});

app.get("/", function (req, res) {
        return res.status(200).json("working");
    }
);

//get list of all the airports
app.get("/airports/getall", function (req, res) {
        pool.getConnection(function (err, con) {
            con.query("SELECT * from Airport_Details", function (error, results, fields) {
                if (error) {
                    console.log(error);
                    return res.status(400).json({"error": error});
                }
                else {
                    con.release();
                    return res.status(200).json(results);
                }
            });
        })
    }
);

//get list of all the devices installed at the airport
app.post("/devices/getall", function (req, res) {
    var Airport_id = req.body.Airport_id;
    if (!Airport_id) return res.status(400).json({"error": "Airport_id required"});
    pool.getConnection(function (err, con) {
        con.query("SELECT * from Devices where Airport_id = ? and Node_id IS NOT NULL", [Airport_id], function (error, results, fields) {
            if (error) {
                console.log(error);
                return res.status(400).json({"error": error});
            }
            else {
                con.release();
                return res.status(200).json(results);
            }
        });
    })
});

//post the route in the table routes
app.post("/routes/saveroute", function (req, res) {
    var Airport_id = req.body.Airport_id;
    var Route = req.body.Route;

    if (!Airport_id || !Route) return res.status(400).json({"error": "Airport_id or Route missing !! "});
    pool.getConnection(function (err, con) {
        con.query("SELECT count(*) from Routes where Airport_id = ? ", [Airport_id], function (error, results, fields) {
            if (error) {
                console.log("Cannot retrieve count of routes for an airport " + error);
                return res.status(400).json({"error": error});
            }
            else {
                var Route_id = Airport_id + "_" + results[0]['count(*)'];
                con.query("INSERT INTO Routes values(?,?,?)", [Route_id, Airport_id, Route], function (error, results, fields) {
                    if (error) throw err;
                    else {
                        con.release();
                        return res.status(200).json({"Message": "Route successfully created",Route_id:Route_id,Airport_id:Airport_id,Route:Route});
                    }
                });
            }
        });
    });
})

//Delete all entries for a particular airport from routes testing purpose only
app.post("/routes/deleteall", function (req, res) {
    var Airport_id = req.body.Airport_id;
    pool.getConnection(function (err, con) {
        con.query("Delete from Routes where Route_id like ?; ", [Airport_id + '%'], function (error, results, fields) {
            if (error) {
                console.log(error);
                return res.status(400).json({"error": error});
            }
            else {
                con.release();
                return res.status(200).json({"message": "Delete Successful"});
            }
        });
    })
});

//add network to an airport
app.post("/config/addnetwork", function (req, res) {
    var Airport_id = req.body.Airport_id;
    var Location = req.body.Location;
    if (!Airport_id) return res.status(400).json({"error": "Airport_id required"});
    if (!Location) return res.status(400).json({"error": "Location required"});
    pool.getConnection(function (err, con) {
        con.query("select * from Devices where Airport_id = ? order by Devices.Device_id desc limit 1", [Airport_id], function (error, results, fields) {
            if (error) {
                console.log(error);
                return res.status(400).json({"error": error});
            }
            else {
                var a = JSON.stringify(results),
                    b = JSON.parse(a),
                    c = b[0].Device_id.split("_"),
                    d = parseInt(c[1]) + 1,
                    did = c[0] + "_" + d + "_",
                    n = b[0].Network_id,
                    nid = parseInt(n) + 1;
                con.query("insert into Devices values(?, ?, ?, ?, ?, ?)", [did, Airport_id, nid, null, Location, 0], function (error, results, fields) {
                    if (error) {
                        console.log(error);
                        con.release();
                        return res.status(400).json({"error": error});
                    }
                    else {
                        con.release();
                        return res.status(200).json({
                            "message": "New network successfully added",
                            "Device_id": did,
                            "Airport_id": Airport_id,
                            "Network_id": nid,
                            "Location": Location,
                            "Node_count": 0
                        });
                    }
                });
            }
        });
    });

});

//add node to a specific network
app.post("/config/addnode", function (req, res) {
    var Airport_id = req.body.Airport_id;
    var Network_Device_id = req.body.Network_Device_id;
    var Location = req.body.Location;
    if (!Airport_id) return res.status(400).json({"error": "Airport_id required"});
    if (!Network_Device_id) return res.status(400).json({"error": "Network_Device_id required"});
    if (!Location) return res.status(400).json({"error": "Location required"});
    pool.getConnection(function (err, con) {
        con.query("select * from Devices where Airport_id = ? and Device_id = ? order by Device_id desc limit 1", [Airport_id, Network_Device_id], function (error, results, fields) {
            if (error) {
                console.log(error);
                return res.status(400).json({"error": error});
            }
            else {
                var a = JSON.stringify(results),
                    b = JSON.parse(a);
                var c, d, did, n, nid, nc;
                if (parseInt(b[0].Node_count) == 0) {
                    c = b[0].Device_id.split("_");
                    d = parseInt(c[1]) + 1;
                    did = c[0] + "_" + c[1] + "_" + "0";
                    n = b[0].Network_id;
                    nid = 0;
                    nc = 1;
                }
                else {
                    c = b[0].Device_id.split("_");
                    d = parseInt(b[0].Node_count);
                    did = c[0] + "_" + c[1] + "_" + d;
                    n = b[0].Network_id;
                    nid = d;
                    nc = parseInt(b[0].Node_count) + 1;
                }
                con.query("update Devices set Node_count = ? where Device_id = ?", [nc, Network_Device_id], function (error, results, fields) {
                    if (error) {
                        console.log(error);
                        return res.status(400).json({"error": error});
                    }
                    else {
                        con.query("insert into Devices values(?, ?, ?, ?, ?, ?)", [did, Airport_id, n, nid, Location, -1], function (error, results, fields) {
                            if (error) {
                                console.log(error);
                                con.release();
                                return res.status(400).json({"error": error});
                            }
                        else {
                                con.release();
                                return res.status(200).json({
                                    "message": "New node successfully added",
                                    "Device_id": did,
                                    "Airport_id": Airport_id,
                                    "Network_id": n,
                                    "Node_id": nid,
                                    "Location": Location,
                                    "Node_count": -1
                                });
                            }
                        });
                    }
                });
            }
        });
    });
});


// catch 404 and forward to error handler
app.use(function (req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});
app.listen(app.get('port'), function () {
    console.log('Server has started! http://localhost:' + app.get('port') + '/');
});

module.exports = app;