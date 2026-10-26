import { join } from 'path'
import { app } from 'electron'
import { pinUserDataPath } from '../user-data'

// Must run before anything reads userData (the portable edition moves it next to the exe)
pinUserDataPath()

export const dbPath = join(app.getPath('userData'), 'home-budget.db')
