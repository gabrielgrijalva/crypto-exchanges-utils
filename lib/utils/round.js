module.exports = {
  /**
   * Rounds up a number with a specified precision limit.
   *
   * @param {number} number Number with decimals to be rounded.
   * @param {number} precision Precision limit to which number should be rounded.
   */
  up: (number, precision) => Math.ceil(number * (10 ** precision))
    / (10 ** precision),

  /**
   * Rounds down a number with a specified precision limit.
   *
   * @param {number} number Number with decimals to be rounded.
   * @param {number} precision Precision limit to which number should be rounded.
   */
  down: (number, precision) => Math.floor(number * (10 ** precision))
    / (10 ** precision),

  /**
   * Rounds a number with a specified precision limit.
   *
   * @param {number} number Number with decimals to be rounded.
   * @param {number} precision Precision limit to which number should be rounded.
   */
  normal: (number, precision) => Math.round(number * (10 ** precision))
    / (10 ** precision),
};
