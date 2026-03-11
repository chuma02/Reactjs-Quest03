function fizzBuzz(n) {
  const result = [];

  for (let value = 1; value <= n; value += 1) {
    if (value % 15 === 0) {
      result.push("FizzBuzz");
    } else if (value % 3 === 0) {
      result.push("Fizz");
    } else if (value % 5 === 0) {
      result.push("Buzz");
    } else {
      result.push(String(value));
    }
  }

  return result;
}

module.exports = fizzBuzz;
module.exports.fizzBuzz = fizzBuzz;