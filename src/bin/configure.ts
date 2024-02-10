import { makeConfig } from 'cleaner-config'

import { asClientConfig } from '../demo/clientConfig'

export const clientConfig = makeConfig(asClientConfig, './clientConfig.json')
