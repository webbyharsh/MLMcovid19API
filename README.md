# MLMcovid19API
API reference

(GET) /firestore/getUsers Get all the users avaliable in the database

(GET) /firestore/getUser/:name Get top 10 health data of a particular user with timestamp

(POST) /firestore/writeUser/:name Write the health data in the database

(GET) /firestore/getLast/:number/:name Get the last :number entries from the databse for doc :name

(GET) /firestore/getToday/:number/:name/:dateMillis Get all data of that particular day with statistical info

NOTE: All date millis are time at the start of the day i.e at 12 am

(GET) /firestore/getStatisticalData/:currentDateMillis/:compareDateMillis/:name Get statistical data for that day with corelation and covariance
