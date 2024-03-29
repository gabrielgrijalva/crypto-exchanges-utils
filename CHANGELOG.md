# Changelog
All notable changes to this project will be documented in this file.

## [8.1.0] - 2022-05-04
- Changed channel of order books in okex-futures-v5.

## [8.0.0] - 2022-03-02
- Added debugging logs.

## [7.9.0] - 2022-03-02
- Updated project version of dependencies.

## [7.8.0] - 2022-02-25
- Added debugging logs to okex-futures-v5.

## [7.7.0] - 2022-02-07
- Corrected error in okex-futures-v5 on websocket disconnection.

## [7.6.0] - 2022-01-18
- Changed project versions dependencies.

## [7.5.0] - 2021-12-17
- Corrected error in okex-futures-v5 order-book.

## [7.4.0] - 2021-12-17
- Implemented okex-futures-v5 order-book and populator.

## [7.3.0] - 2021-11-19
- Changed project versions dependencies.

## [7.2.0] - 2021-11-19
- Changed project versions dependencies.

## [7.1.0] - 2021-11-18
- Implemented phemex order book.

## [7.0.0] - 2021-11-11
- Added bitmex error handler in candles populator.

## [6.9.0] - 2021-10-11
- Added bitmex and kraken order book price filters.

## [6.8.0] - 2021-09-20
- Extended frozen order book checker.

## [6.7.0] - 2021-07-13
- Corrected errors in bitmex and kraken populators.

## [6.6.0] - 2021-07-09
- Implemented one forge forex populators.

## [6.5.0] - 2021-07-08
- Updated dependencies project versions.
- Corrected error in kraken candle populator.

## [6.4.0] - 2021-07-07
- Implemented deribit cron populators.

## [6.3.0] - 2021-06-17
- Implemented deribit orderbook.

## [6.2.0] - 2021-05-27
- Changed project versions dependencies.

## [6.1.0] - 2021-05-10
- Corrected error in kraken-futures.

## [6.0.0] - 2021-05-10
- Implemented corrections in candles cron populator for kraken-futres.

## [5.9.0] - 2021-05-07
- Implemented corrections in candles cron populator.

## [5.8.0] - 2021-04-21
- Implemented order book broadcast levels limit.

## [5.7.0] - 2021-04-05
- Corrected error in bitstamp populator cron.

## [5.6.0] - 2021-03-30
- Implemented bitstamp cron populator.

## [5.5.0] - 2021-03-19
- Corrected error in order book wss.

## [5.4.0] - 2021-02-25
- Updated project dependencies versions.

## [5.3.0] - 2021-02-24
- Updated project dependencies versions.

## [5.2.0] - 2021-02-24
- Corrected error in order book.

## [5.1.0] - 2021-02-24
- Updated project versions dependencies.

## [5.0.0] - 2021-02-12
- Implemented websocket server for exchanges order books.

## [4.9.0] - 2021-02-10
### Added
- Changed order book update limit before reconnecting.

## [4.8.0] - 2021-02-02
### Added
- Changed project versions dependencies.

## [4.7.0] - 2021-02-02
### Added
- Changed project versions dependencies.

## [4.6.0] - 2020-12-01
### Added
- Implemented last timestamp update to binance-coin-futures order book.

## [4.5.0] - 2020-10-17
### Added
- Corrected okex populator.

## [4.4.0] - 2020-10-14
### Added
- Correctd binance populator implementations.

## [4.3.0] - 2020-10-14
### Added
- Changed okex populator implementations.

## [4.2.0] - 2020-10-02
### Added
- Added Bybit utils.

## [4.1.0] - 2020-10-01
### Added
- Added Okex populators.

## [4.0.0] - 2020-09-25
### Added
- Kraken futures order book and populators.

## [3.9.0] - 2020-09-22
### Changed
- Updated project dependencies versions.

## [3.8.0] - 2020-09-22
### Added
- Added binance futures database candle populator.
- Added binance coin futures database candle populator.

## [3.7.0] - 2020-09-15
### Added
- Added binance coin futures to index main export module.

## [3.6.0] - 2020-09-14
### Added
- Added binance coin futures utils.

## [3.5.0] - 2020-09-14
### Changed
- Updated project versions dependencies.

## [3.4.0] - 2020-09-09
### Changed
- Corrected error in bitflyer candle populator.

## [3.3.0] - 2020-09-08
### Added
- Added error handler to huobi dm swap candle populator.

## [3.1.0] - 2020-08-07
### Added
- Changed creating of renko candles for bitflyer.

## [3.0.0] - 2020-08-02
### Added
- Added bitflyer renko candles populator.
- Changed implementation for creating candles for bitflyer.

## [2.9.0] - 2020-07-09
### Added
- Implemented ping interval to database connection in candle populator cron.

## [2.8.0] - 2020-07-09
### Added
- Added bitmex candle populator from api to db.
- Added bitmex candle populator from api to db in cron interval.

## [2.7.0] - 2020-06-08
### Added
- Added bitflyer candle populator api db cron.

## [2.6.0] - 2020-05-22
### Added
- Added debugging logs to candles populator.
- Created huobi dm swap candles database populator.

## [2.5.0] - 2020-05-21
### Added
- Created huobi dm swap candles cron database populator.
- created binance futures candles cron database populator.

## [2.4.0] - 2020-05-18
### Added
- Created binance futures order book.

## [2.3.3] - 2020-05-11
### Changed
- Corrected error in bitflyer order book.

## [2.3.3] - 2020-05-11
### Changed
- Implemented last update timestamp checker in bitmex order book.
- Implemented last update timestamp checker in bitflyer order book.

## [2.3.2] - 2020-05-08
### Changed
- Corrected error in bitflyer order book implementation.

## [2.3.1] - 2020-04-27
### Changed
- Changed implementation for desconnecting huobi dm order book.

## [2.3.0] - 2020-04-24
### Changed
- Implemented mechanism to detect when huobi dm order book has not been 
  updated for an amount of time.

## [2.2.0] - 2020-04-17
### Changed
- Implemented huobi dm swap order book.

## [2.1.0] - 2020-04-02
### Changed
- Corrected error when handling close connection for bitflyer order book.

## [2.0.0] - 2020-02-06
### Added
- Added binance order book.
- Added bitfinex order book.
- Added bitstamp order book.
- Added coinbase order book.
- Added kraken order book.

## [1.7.0] - 2020-01-27
### Changed
- Changed project version dependencies.

## [1.6.0] - 2020-01-27
### Changed
- Changed project version dependencies.

## [1.5.0] - 2019-12-12
### Changed
- Corrected error when reconnecting order books after closed connection.

## [1.4.2] - 2019-10-30
### Changed
- Corrected error of not cleaning internal interval when disconnecting huobi dm order book.

## [1.4.1] - 2019-10-09
### Added
- Added order book frozen error hanlder to huobi dm order book implementation.

## [1.4.0] - 2019-08-21
### Added 
- Added OKEX order book interface for connecting to realtime market data.

## [1.3.0] - 2019-08-21
### Added 
- Added 'reconnection' function to bitmex order book client.

### Changed
- Added to bitmex order book client an error handler when order to update does not exist.

## [1.2.5] - 2019-08-15
### Changed
- Updated project versions dependencies.

## [1.2.4] - 2019-08-15
### Changed
- Updated project versions dependencies.

## [1.2.3] - 2019-07-30
### Changed
- Included changes from previous error corrections.

## [1.2.2] - 2019-07-30
### Changed
- Corrected error that broke bitmex order book implementation.

## [1.2.1] - 2019-07-30
### Changed
- Changed disconnect functionality in order to preserve orders in the order book before disconnecting. Implemented in all exchanges interfaces.

## [1.2.0] - 2019-07-30
### Changed
- Changed disconnect function from BITFLYER order book interface. Now if disconnected manually, order book will not try to reconnect.
- Changed disconnect function from BITMEX order book interface. Now if disconnected manually, order book will not try to reconnect.
- Changed disconnect function from HUOBI DM order book interface. Now if disconnected manually, order book will not try to reconnect.

## [1.1.0] - 2019-07-24
### Added
- Create BITFLYER order-book interface for connecting to realtime market data.

### Changed
- Corrected error when receiving an "error" event in HUOBI DM order-book interface.

## [1.0.0] - 2019-07-04
### Added
- Created BITMEX order-book interface for connecting to realtime market data.
- Created HUOBI DM order-book interface for connecting to realtime market data.
