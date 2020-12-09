import React, { PureComponent } from 'react'

interface TimePeriodsProps {
  timePeriod: string
  changeTimePeriod: any
}

const timePeriodHolder = {
  marginLeft: '14px',
  marginTop: '16px'
}

const timePeriodButton = {
  backgroundColor: 'transparent',
  fontSize: '16px',
  cursor: 'pointer',
  marginRight: '20px',
  border: 'none'
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
        <div style={timePeriodHolder}>
          <button
            style={timePeriodButton}
            onClick={() => this.props.changeTimePeriod('hour')}
          >
            Hourly
          </button>
          <button
            style={timePeriodButton}
            onClick={() => this.props.changeTimePeriod('day')}
          >
            Daily
          </button>
          <button
            style={timePeriodButton}
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
