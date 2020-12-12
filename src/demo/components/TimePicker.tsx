import React, { PureComponent } from 'react'
import DatePicker from 'react-datepicker'

const dateContainer = {
  marginLeft: '26px'
}

const calendarText = {
  marginTop: '20px',
  fontSize: '16px',
  color: 'white'
}

const dateInput = {
  marginLeft: '-2px',
  fontSize: '16px',
  backgroundColor: 'transparent' as 'transparent',
  border: 'none',
  color: 'white',
  width: '100px'
}

interface TimePickerProps {
  label: string
  timePicker?: boolean
  date: Date
  onChange: (e: Date) => void
}

class TimePicker extends PureComponent<TimePickerProps, {}> {
  render(): JSX.Element {
    const { label, timePicker = false } = this.props
    return (
      <div style={dateContainer}>
        <div style={calendarText}>{label}</div>
        <DatePicker
          customInput={<input style={dateInput} />}
          showTimeSelect={timePicker}
          selected={this.props.date}
          onChange={e => this.props.onChange(e)}
        />
      </div>
    )
  }
}
export default TimePicker
