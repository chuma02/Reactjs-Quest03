import React from "react";
import "./CalcButton.css";

const CalcButton = ({ label, onClick }) => {
  const isOperator = ['+', '-', '*', '/'].includes(label);
  const isClear = label === 'C';
  const buttonClass = `calc-button ${isOperator ? 'operator' : ''} ${isClear ? 'clear' : ''}`.trim();
  return (
    <button className={buttonClass} onClick={() => onClick(label)}>
      {label}
    </button>
  );
};

export default CalcButton;
