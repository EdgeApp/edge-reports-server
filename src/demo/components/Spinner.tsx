import React, { PureComponent } from 'react'
import Loader from 'react-loader-spinner'

const loader = {
  textAlign: 'center' as 'center',
  marginTop: '29px'
}

class Spinner extends PureComponent<{}, {}> {
  render(): JSX.Element {
    return (
      <div style={loader}>
        <Loader type="Oval" color="white" height="30px" width="30px" />
      </div>
    )
  }
}
export default Spinner
