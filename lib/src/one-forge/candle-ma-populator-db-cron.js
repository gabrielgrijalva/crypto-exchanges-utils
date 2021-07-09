const mysql = require('mysql');
const moment = require('moment');
const CronJob = require('cron').CronJob;
const round = require('../../utils/round');

let settings = null;
let connectionClient = null;

const CandleMaPopulatorDbCron = {};

function getConnection() {
  const config = {};
  config.port = settings.DATABASE_PORT;
  config.host = settings.DATABASE_HOST;
  config.user = settings.DATABASE_USER;
  config.timezone = 'Z';
  config.database = settings.DATABASE_NAME;
  config.password = settings.DATABASE_PASSWORD;
  const connection = mysql.createConnection(config);
  setInterval(() => connection.ping(), 3600000);
  return connection;
};
function getLastCandles() {
  return new Promise(resolve => {
    const sql = `SELECT * FROM ${settings.SOURCE_TABLE} ORDER BY timestamp 
      DESC LIMIT ${settings.MA_PERIODS}`;
    connectionClient.query(sql, (err, results) => {
      if (err) {
        console.log('getLastCandles error');
        console.log(err);
        throw err;
      }
      resolve(results.map(v => +v[settings.SOURCE_PROPERTY]));
    });
  });
};
function saveData(data) {
  return new Promise(resolve => {
    const query = `INSERT INTO ${settings.TARGET_TABLE} SET ?`;
    connectionClient.query(query, [data], (err) => {
      if (err) {
        console.log(err);
        throw new Error('Error when saving candle to database.');
      }
      resolve();
    });
  });
};

CandleMaPopulatorDbCron.run = function (settingsInfo) {
  console.log('Initialized candles ma');
  settings = settingsInfo;
  connectionClient = getConnection(settingsInfo);
  new CronJob('00 * * * * *', async () => {
    try {
      const timestamp = moment.utc().subtract(settings.MA_INTERVAL, 'seconds');
      if (timestamp.unix() % settings.MA_INTERVAL !== 0) { return };
      const candles = await getLastCandles();
      const maValue = round.normal(candles.reduce((a, v, i) => (candles.length - 1) !== i
        ? (a + v) : ((a + v) / (candles.length)), 0), 5);
      const data = {};
      data.maValue = maValue;
      data.timestamp = timestamp.format('YYYY-MM-DD HH:mm:ss');
      if (data.maValue) {
        await saveData(data);
        console.log(`Saved ${timestamp.format('YYYY-MM-DD HH:mm:ss')}`)
      }
    } catch (error) {
      console.log(error);
    }
  }, () => { }, true);
}
module.exports = CandleMaPopulatorDbCron;
