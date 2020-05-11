# Changelog
All notable changes to this project will be documented in this file.

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
