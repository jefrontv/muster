import { createHmac } from 'node:crypto'

/** Build a wire-format SSH public-key blob (`uint32 length` + algorithm name + body). */
export function hostKeyBlob(algorithm: string, material: string): Buffer {
  const name = Buffer.from(algorithm, 'utf8')
  const header = Buffer.alloc(4)
  header.writeUInt32BE(name.length, 0)
  return Buffer.concat([header, name, Buffer.from(material, 'utf8')])
}

/** One `host keytype base64key` known_hosts line whose key survives payload validation. */
export function knownHostsLine(hostField: string, algorithm: string, material: string): string {
  return `${hostField} ${algorithm} ${hostKeyBlob(algorithm, material).toString('base64')}`
}

/** OpenSSH `|1|salt|hash` hashed host field for `label`. */
export function hashedHostField(label: string, salt: string): string {
  const saltBytes = Buffer.from(salt, 'utf8')
  const hash = createHmac('sha1', saltBytes).update(label).digest()
  return `|1|${saltBytes.toString('base64')}|${hash.toString('base64')}`
}
