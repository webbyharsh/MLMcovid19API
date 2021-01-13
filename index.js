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
        let stats_obj = getStatisticalInfo(health_data, true);
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

app.get('/firestore/getStatisticalData/:currentDateMillis/:compareDateMillis/:name', async(req, res) =>{
    let docName = req.params.name;
    //let n = parseInt(req.params.number);
    const dateNow = new Date();
    const currentDate = new Date(parseFloat(req.params.currentDateMillis));
    const currentEndDate = new Date(parseFloat(req.params.currentDateMillis) + 86400000);

    const fromDate  = new Date(parseFloat(req.params.currentDateMillis));
    const endDate = new Date(parseFloat(req.params.currentDateMillis) + 86400000);
    let compareFromDate = 0;
    let compareEndDate = 0;
    let currentHealthData = [];
    let compareHealthData = [];

    if(req.params.compareDateMillis == "0"){
        let tempDate = fromDate;
        tempDate.setDate(tempDate.getDate()-1);
        compareFromDate = tempDate;
        compareEndDate = new Date(parseFloat(compareFromDate.getTime()) + 86400000);
        //tempDate.setDate(tempDate.getDate()+1);
    }else{
        compareFromDate = new Date(parseFloat(req.params.compareDateMillis));
        compareEndDate = new Date(parseFloat(req.params.compareDateMillis) + 86400000);
    }
    console.log(currentDate.toLocaleString());
    console.log(compareFromDate.toLocaleString());
    let response = {};
    const dbRef = db.collection('covid19_health');
    try {
        let results = await dbRef.doc(docName).collection('health_data').where("datetime" , ">=", currentDate)
        .where("datetime", "<=", currentEndDate)
        .orderBy("datetime", "desc")
        .limit(30)
        .get();
       // console.log(results);
        results.forEach(doc =>{
            let d = doc.data();
            //console.log(d);
            currentHealthData.push({
                ...d
            });
        });
        
        let resultsCompare = await dbRef.doc(docName).collection('health_data').where("datetime" , ">=", compareFromDate)
        .where("datetime", "<=", compareEndDate)
        .orderBy("datetime", "desc")
        .limit(30)
        .get();

        resultsCompare.forEach(doc =>{
            let d = doc.data();
            compareHealthData.push({
                ...d
            });
        });

        //console.log(currentHealthData);
        response = getStatisticalInfo(currentHealthData, false, compareHealthData);

    } catch (err) {
        console.log(err);
        res.send("Error " +err);
    } finally {
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

function getStatisticalInfo(arr, isBasic, arr2){
    let resp = {};
    let heartrate = [];
    let spo2 = [];
    let temperature = [];

    //for second healthdata for calculation of corelation
    let compare_heartrate = [];
    let compare_spo2 = [];
    let compare_temperature = [];

    arr.map((data) =>{
        heartrate.push(data.heartRate);
        spo2.push(data.spo2);
        temperature.push(data.temperature);
    });

    arr2.map((data) =>{
        compare_heartrate.push(data.heartRate);
        compare_spo2.push(data.spo2);
        compare_temperature.push(data.temperature);
    });

    if(heartrate.length == 0 || spo2.length == 0 || temperature.length == 0){
        resp = {};
        return resp;
    }
    let hr_mean = stats.mean(heartrate);
    let hr_median = stats.median(heartrate);
    let hr_mode = stats.mode(heartrate);
    let hr_variance = stats.variance(heartrate);
    let hr_sd = stats.standardDeviation(heartrate);


    let sp_mean = stats.mean(spo2);
    let sp_median = stats.median(spo2);
    let sp_mode = stats.mode(spo2);
    let sp_variance = stats.variance(spo2);
    let sp_sd = stats.standardDeviation(spo2);

    
    let te_mean = stats.mean(temperature);
    let te_median = stats.median(temperature);
    let te_mode = stats.mode(temperature);
    let te_variance = stats.variance(temperature);
    let te_sd = stats.standardDeviation(temperature);

    
    resp = {
        hr:{
            hr_mean,
            hr_median,
            hr_mode,
            hr_variance,
            hr_sd
        },
        sp:{
            sp_mean,
            sp_median,
            sp_mode,
            sp_variance,
            sp_sd
        },
        te:{
            te_mean,
            te_median,
            te_mode,
            te_variance,
            te_sd
        }
    }
    if(isBasic){
        return resp;
    }else{
        let hr_cover = 0;
        let sp_cover = 0;
        let te_cover = 0;
        let hr_sp_corel = 0;
        let sp_temp_corel = 0;
        let temp_hr_corel = 0;
        hr_sp_corel = stats.sampleCorrelation(heartrate, spo2);
        sp_temp_corel = stats.sampleCorrelation(spo2, temperature);
        temp_hr_corel = stats.sampleCorrelation(temperature, heartrate);



        if(compare_heartrate.length != 0 && compare_spo2.length != 0 && compare_temperature.length != 0){
            hr_cover = stats.sampleCovariance(heartrate, compare_heartrate);
            sp_cover = stats.sampleCovariance(spo2, compare_spo2);
            te_cover = stats.sampleCovariance(temperature, compare_temperature);
        }
        return {
            ...resp,
            hr_cover,
            sp_cover,
            te_cover,
            hr_sp_corel,
            sp_temp_corel,
            temp_hr_corel
        }
    }
}


async function validateData(data){
    return data;
}

function calculate_health_index(heartRate, spo2, temperature){
    
    return 'A+'
}

