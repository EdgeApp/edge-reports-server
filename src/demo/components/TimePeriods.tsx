import React, { PureComponent } from 'react'

import { TimePeriodButton } from './Buttons'

interface TimePeriodsProps {
  timePeriod: string
  changeTimePeriod: any
}

const timePeriodHolder = {
  marginLeft: '14px',
  marginTop: '16px'
}

const underLineTimePeriod = {
  quarter: {
    marginLeft: '251px',
    width: '70px',
    marginTop: '2px'
  },
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
        <div style={timePeriodHolder}>
          <TimePeriodButton
            label="Hourly"
            onClick={() => this.props.changeTimePeriod('hour')}
          />
          <TimePeriodButton
            label="Daily"
            onClick={() => this.props.changeTimePeriod('day')}
          />
          <TimePeriodButton
            label="Monthly"
            onClick={() => this.props.changeTimePeriod('month')}
          />
          <TimePeriodButton
            label="Quarterly"
            onClick={() => this.props.changeTimePeriod('quarter')}
          />
        </div>
        <hr style={underLineTimePeriod[this.props.timePeriod]} />
      </>
    )
  }
}
export default TimePeriods
