import React, { PureComponent } from 'react'

import * as styleSheet from '../../styles/common/textStyles.js'

interface TimePeriodsProps {
  timePeriod: string
  changeTimePeriod: any
}

const underLineTimePeriod = {
  month: {
    marginLeft: '160px',
    width: '66px',
    marginTop: '2px'
  },
  day: {
    marginLeft: '95px',
    width: '42px',
    marginTop: '2px'
  },
  hour: {
    marginLeft: '16px',
    width: '53px',
    marginTop: '2px'
  }
}

class TimePeriods extends PureComponent<TimePeriodsProps, {}> {
  render(): JSX.Element {
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
        <hr style={underLineTimePeriod[this.props.timePeriod]} />
      </>
    )
  }
}
export default TimePeriods
