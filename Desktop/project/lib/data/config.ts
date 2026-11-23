import type { DataProvider } from '@/lib/data/provider'
import { localProvider } from '@/lib/data/local-provider'

export const dataProvider: DataProvider = localProvider
