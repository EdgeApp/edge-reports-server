import '../demo.css'

import React from 'react'

const TimePeriods: any = (props: {
  changeTimePeriod: any
  timePeriod: string
}) => {
  let tpWidth
  let tpPosition
  if (props.timePeriod === 'month') {
    tpPosition = '201px'
    tpWidth = '60px'
  } else if (props.timePeriod === 'day') {
    tpPosition = '113px'
    tpWidth = '42px'
  } else {
    tpPosition = '16px'
    tpWidth = '51px'
  }
  const underlineTimePeriodStyle = {
    width: tpWidth,
    marginTop: '2px',
    marginLeft: tpPosition
  }
  return (
    <>
      <div id="time-period-holder">
        <button
          className="time-period"
          onClick={() => props.changeTimePeriod('hour')}
        >
          Hourly
        </button>
        <button
          className="time-period"
          onClick={() => props.changeTimePeriod('day')}
        >
          Daily
        </button>
        <button
          className="time-period"
          onClick={() => props.changeTimePeriod('month')}
        >
          Monthly
        </button>
      </div>
      <hr style={underlineTimePeriodStyle} />
    </>
  )
}
export default TimePeriods
