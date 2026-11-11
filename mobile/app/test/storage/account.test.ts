/**
 * @jest-environment node
 */
// One database per account and server, deleted at sign-out (design D4, task 4.3).
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { db } from '@shared/db'
import { resetModuleState } from '@shared/moduleState'
import { installPlatform, platform } from '@shared/platform'
import { sqliteDatabase } from '../../src/storage/adapter'
import { accountDatabaseName, forgetAccount, openAccount } from '../../src/storage/account'
import { nodeSqlite } from './nodeSqlite'

afterEach(() => resetModuleState())

describe('the account database', () => {
  it('is named after the server and the account', () => {
    const a = accountDatabaseName('https://todo.example.com', 'u1')
    expect(a).toMatch(/^opentodo-[0-9a-f]{8}$/)
    expect(accountDatabaseName('https://TODO.example.com/some/path', 'u1')).toBe(a)
    expect(accountDatabaseName('https://todo.example.com', 'u2')).not.toBe(a)
    expect(accountDatabaseName('https://other.example.com', 'u1')).not.toBe(a)
  })

  it('opens at sign-in and is deleted at sign-out', async () => {
    const sql = nodeSqlite()
    installPlatform({ ...platform, database: (declared) => sqliteDatabase(declared, sql) })
    openAccount('https://todo.example.com', 'u1')
    const file = join(sql.dir, `${accountDatabaseName('https://todo.example.com', 'u1')}.sqlite`)
    await db.meta.put({ key: 'userId', value: 'u1' })
    expect(existsSync(file)).toBe(true)
    await forgetAccount()
    expect(existsSync(file)).toBe(false)
  })
})
