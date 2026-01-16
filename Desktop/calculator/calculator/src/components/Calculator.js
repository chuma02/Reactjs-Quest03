import React, { useState } from "react";
import "./Calculator.css";
import Display from "./Display";
import CalcButton from "./CalcButton";

const Calculator = () => {
  const [display, setDisplay] = useState("0");
  const [previous, setPrevious] = useState(null);
  const [operation, setOperation] = useState(null);

  const handleNumber = (num) => {
    if (display === "0") {
      setDisplay(num);
    } else {
      setDisplay(display + num);
    }
  };

  const handleOperator = (op) => {
    if (previous === null) {
      setPrevious(display);
      setDisplay("0");
      setOperation(op);
    } else {
      const result = calculate(previous, display, operation);
      setDisplay(result.toString());
      setPrevious(result);
      setOperation(op);
    }
  };

  const handleEqual = () => {
    if (previous !== null && operation !== null) {
      const result = calculate(previous, display, operation);
      setDisplay(result.toString());
      setPrevious(null);
      setOperation(null);
    }
  };

  const handleClear = () => {
    setDisplay("0");
    setPrevious(null);
    setOperation(null);
  };

  const calculate = (a, b, op) => {
    const numA = parseFloat(a);
    const numB = parseFloat(b);
    switch (op) {
      case "+":
        return numA + numB;
      case "-":
        return numA - numB;
      case "*":
        return numA * numB;
      case "/":
        return numB !== 0 ? numA / numB : "Error";
      default:
        return 0;
    }
  };

  return (
    <div className="calculator">
      <Display value={display} />
      <div className="buttons">
        <CalcButton label="1" onClick={() => handleNumber("1")} />
        <CalcButton label="2" onClick={() => handleNumber("2")} />
        <CalcButton label="3" onClick={() => handleNumber("3")} />
        <CalcButton label="+" onClick={() => handleOperator("+")} />
        <CalcButton label="4" onClick={() => handleNumber("4")} />
        <CalcButton label="5" onClick={() => handleNumber("5")} />
        <CalcButton label="6" onClick={() => handleNumber("6")} />
        <CalcButton label="-" onClick={() => handleOperator("-")} />
        <CalcButton label="7" onClick={() => handleNumber("7")} />
        <CalcButton label="8" onClick={() => handleNumber("8")} />
        <CalcButton label="9" onClick={() => handleNumber("9")} />
        <CalcButton label="*" onClick={() => handleOperator("*")} />
        <CalcButton label="C" onClick={handleClear} />
        <CalcButton label="0" onClick={() => handleNumber("0")} />
        <CalcButton label="=" onClick={handleEqual} />
        <CalcButton label="/" onClick={() => handleOperator("/")} />
      </div>
    </div>
  );
};

export default Calculator;
