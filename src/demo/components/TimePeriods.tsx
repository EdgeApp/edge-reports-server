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

const allowTimePeriods = {
  hour: 'Hourly',
  day: 'Daily',
  month: 'Monthly',
  quarter: 'Quarterly'
}

class TimePeriods extends PureComponent<TimePeriodsProps, {}> {
  render(): JSX.Element {
    return (
      <div style={timePeriodHolder}>
        {Object.entries(allowTimePeriods).map(([timePeriod, label]) => (
          <TimePeriodButton
            key={timePeriod}
            underline={this.props.timePeriod === timePeriod}
            label={label}
            onClick={() => this.props.changeTimePeriod(timePeriod)}
          />
        ))}
      </div>
    )
  }
}
export default TimePeriods
