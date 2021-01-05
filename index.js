const admin = require('firebase-admin');
const express = require('express');
const bodyParser = require('body-parser');
const stats = require('simple-statistics');



const app = express();
app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json());

app.use(express.static('public'))

const serviceAccount = require('./secret_key/firebase-admin-sdk-key.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', "Origin", "X-Requested-With, Content-Type, Accept");
    next();
  });
const db = admin.firestore();

app.get('/', (req, res) =>{
    res.sendFile('/index.html');
});

const port = 8000;
app.listen(process.env.PORT , () =>{
    console.log("Listening to port " + process.env.PORT);
});


//For getting all the users in database
app.get('/firestore/getUsers', async (req, res) =>{
    let snapshot;
    let users = [];
    let response = {};
    const date = new Date();
    try{
        const dbRef = db.collection('covid19_health');
        snapshot = await dbRef.get();
        if(snapshot.empty){
            res.send({
                data: 'No documents yet!!'
            });
        }
        snapshot.forEach(doc=>{
            users.push(doc.id);
        });
        response = {
            data: users,
            timestamp: date.toLocaleString(),
            query: 'firestore/getUsers',
            statusCode: '200'
        }
    
    } catch (err){
        console.log(err);
        res.sendStatus(403);
    }
    finally{
        res.send(response);
    }
});

app.get('/firestore/getUser/:name', async (req, res) =>{
    let docName = req.params.name;
    const date = new Date();
    let response = {};
    let health_data = [];
    const dbRef = db.collection('covid19_health');
    let statusCode = 102;
    try {
        let results = await dbRef.doc(docName).collection('health_data').orderBy("datetime", "desc").limit(10).get();
        results.forEach(doc => {
            let d = doc.data();
            health_data.push({
                ...d,
                id: doc.id
            });
        });
        if(health_data.length==0){
            statusCode = 404;
        }else{
            statusCode = 200;
        }
        response = {
            health_data: health_data,
            statusCode: statusCode,
            datetime: date.toLocaleString(),
            user: docName
        }
        
    } catch (err) {
        res.send({
            ...err,
            statusCode: 403
        });
    } finally{
        res.send(response);
    }
});


//for writing in the database
app.post('/firestore/writeUser/:name', async(req, res)=>{
    const userName = req.params.name;
    console.log(userName)
    const date = admin.firestore.Timestamp.fromDate(new Date());
    let heartRate = req.body.heartRate;
    let spo2 = req.body.spo2;
    let temperature = req.body.temperature;
    const data = {
        heartRate: parseFloat(heartRate),
        spo2: parseFloat(spo2),
        temperature: parseFloat(temperature),
        datetime: date,
        // healthIndex: calculate_health_index(heartRate, spo2, temperature),
    }
    const dbRef = db.collection('covid19_health');
    let response = {};
    try {
        const rectifiedData = await validateData(data);
        const setData = await dbRef.doc(userName).collection('health_data').add(rectifiedData);
        response = {
            statusCode:200,
            dataAdded: true
        }
    } catch (err) {
        console.log(err);
    } finally{
        res.send(response);
    }
});


//FOR MAKING CHARTS ON THE DASHBOARD PAGE
app.get('/firestore/getLast/:number/:name', async(req, res) =>{
    let docName = req.params.name;
    let n = parseInt(req.params.number);
    const date = new Date();
    let response = {};
    let health_data = [];
    const dbRef = db.collection('covid19_health');
    let statusCode = 102;
    try {
        let results = await dbRef.doc(docName).collection('health_data').orderBy("datetime", "desc").limit(n).get();
        results.forEach(doc => {
            let d = doc.data();
            health_data.push({
                ...d,
            });
        });
        if(health_data.length==0){
            statusCode = 404;
        }else{
            statusCode = 200;
        }
        let response_arr = formulateDataForDashboard(health_data);
        response = {
            health_data: response_arr,
            statusCode: statusCode,
            datetime: date.toLocaleString(),
            user: docName
        }
        
    } catch (err) {
        res.send({
            ...err,
            statusCode: 403
        });
    } finally{
        res.send(response);
    }
});

//FOR MAKING CHARTS ON THE DASHBOARD PAGE


app.get('/firestore/getToday/:number/:name/:dateMillis', async(req, res) =>{
    let docName = req.params.name;
    let n = parseInt(req.params.number);
    const dateNow = new Date();
    const fromDate  = new Date(parseFloat(req.params.dateMillis));
    const endDate = new Date(parseFloat(req.params.dateMillis) + 86400000);
    let response = {};
    let health_data = [];
    const dbRef = db.collection('covid19_health');
    let statusCode = 102;
    try {
        let results = await dbRef.doc(docName).collection('health_data').where("datetime" , ">=", fromDate)
        .where("datetime", "<=", endDate)
        .orderBy("datetime", "desc")
        .limit(n).get();
        results.forEach(doc => {
            let d = doc.data();
            health_data.push({
                ...d,
            });
        });
        if(health_data.length==0){
            statusCode = 404;
        }else{
            statusCode = 200;
        }
        let response_arr = formulateDataForDashboard(health_data);
        let stats_obj = getStatisticalInfo(health_data);
        response = {
            health_data: response_arr,
            statusCode: statusCode,
            datetime: dateNow.toLocaleString(),
            user: docName,
            stats: stats_obj
        }
        
    } catch (err) {
        console.log(err);
        res.send({
            ...err,
            statusCode: 403
        });
    } finally{
        res.send(response);
    }    
});


function formulateDataForDashboard(arr){
    arr.map((data) =>{
        // if(data.datetime._seconds*1000 >= recent_time){
        //     recent_time = data.datetime._seconds*1000;
        //     response = data;
        // }
        // let time = new Date(data.datetime._seconds*1000);
        //let time_string = time.toLocaleString();
        data.datetime = data.datetime._seconds*1000;
    })
    return arr;
}

function getStatisticalInfo(arr){
    let resp = {};
    let heartrate = [];
    let spo2 = [];
    let temperature = [];
    arr.map((data) =>{
        heartrate.push(data.heartRate);
        spo2.push(data.spo2);
        temperature.push(data.temperature);
    });
    if(heartrate.length == 0 || spo2.length == 0 || temperature.length == 0){
        resp = {};
        return resp;
    }
    let hr_mean = stats.mean(heartrate);
    let hr_median = stats.median(heartrate);
    let hr_mode = stats.mode(heartrate);

    let sp_mean = stats.mean(spo2);
    let sp_median = stats.median(spo2);
    let sp_mode = stats.mode(spo2);
    
    let te_mean = stats.mean(temperature);
    let te_median = stats.median(temperature);
    let te_mode = stats.mode(temperature);
    
    resp = {
        hr:{
            hr_mean,
            hr_median,
            hr_mode
        },
        sp:{
            sp_mean,
            sp_median,
            sp_mode
        },
        te:{
            te_mean,
            te_median,
            te_mode
        }
    }
    return resp;
}


async function validateData(data){
    return data;
}

function calculate_health_index(heartRate, spo2, temperature){
    
    return 'A+'
}

