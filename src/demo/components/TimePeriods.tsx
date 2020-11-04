import React, { Component } from 'react'

import * as styleSheet from '../../styles/common/textStyles.js'

interface TimePeriodsProps {
  timePeriod: string
  changeTimePeriod: any
}

class TimePeriods extends Component<TimePeriodsProps, {}> {
  render(): JSX.Element {
    let tpWidth
    let tpPosition
    if (this.props.timePeriod === 'month') {
      tpPosition = '160px'
      tpWidth = '66px'
    } else if (this.props.timePeriod === 'day') {
      tpPosition = '95px'
      tpWidth = '42px'
    } else {
      tpPosition = '16px'
      tpWidth = '53px'
    }
    const underlineTimePeriodStyle = {
      width: tpWidth,
      marginTop: '2px',
      marginLeft: tpPosition
    }
    return (
      <>
        <div style={styleSheet.timePeriodHolder}>
          <button
            style={styleSheet.timePeriodButton}
            onClick={() => this.props.changeTimePeriod('hour')}
          >
            Hourly
          </button>
          <button
            style={styleSheet.timePeriodButton}
            onClick={() => this.props.changeTimePeriod('day')}
          >
            Daily
          </button>
          <button
            style={styleSheet.timePeriodButton}
            onClick={() => this.props.changeTimePeriod('month')}
          >
            Monthly
          </button>
        </div>
        <hr style={underlineTimePeriodStyle} />
      </>
    )
  }
}
export default TimePeriods
