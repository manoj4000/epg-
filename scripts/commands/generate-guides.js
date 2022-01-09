const { db, logger, file, parser } = require('../core')
const _ = require('lodash')
const dayjs = require('dayjs')
const utc = require('dayjs/plugin/utc')
dayjs.extend(utc)

let programs = {}

const LOGS_PATH = process.env.LOGS_PATH || 'scripts/logs'
const PUBLIC_PATH = process.env.PUBLIC_PATH || '.'

async function main() {
  await setUp()

  await generateGuideXML()
}

main()

async function generateGuideXML() {
  logger.info(`Generating guide.xml...`)

  const channels = Object.keys(programs)
  let items = await db.find({ xmltv_id: { $in: channels } })
  items = _.sortBy(items, item => item.name)

  let buffer = {}
  items.forEach(item => {
    if (!buffer[item.xmltv_id]) {
      const countryCode = item.xmltv_id.split('.')[1]

      buffer[item.xmltv_id] = {
        id: item.xmltv_id,
        display_name: [item.name],
        logo: item.logo || null,
        country: countryCode ? countryCode.toUpperCase() : null,
        site: `https://${programs[item.xmltv_id][0].site}`
      }
    } else {
      if (!buffer[item.xmltv_id].logo && item.logo) {
        buffer[item.xmltv_id].logo = item.logo
      }

      if (!buffer[item.xmltv_id].display_name.includes(item.name)) {
        buffer[item.xmltv_id].display_name.push(item.name)
      }
    }
  })

  items = Object.values(buffer)

  let outputProgs = []
  for (let ip of Object.values(programs)) {
    outputProgs = outputProgs.concat(ip)
  }

  const xml = convertToXMLTV({ channels: items, programs: outputProgs })
  await file.write('./guide.xml', xml)
}

async function setUp() {
  const f = await file.read(`${PUBLIC_PATH}/scripts/output/programs.json`)
  programs = JSON.parse(f)
}

function convertToXMLTV({ channels, programs }) {
  let output = `<?xml version="1.0" encoding="UTF-8" ?><tv>\r\n`
  for (let channel of channels) {
    output += `<channel id="${escapeString(channel.id)}">`
    channel.display_name.forEach(displayName => {
      output += `<display-name>${escapeString(displayName)}</display-name>`
    })
    if (channel.logo) {
      const logo = escapeString(channel.logo)
      output += `<icon src="${logo}"/>`
    }
    output += `<url>${channel.site}</url>`
    output += `</channel>\r\n`
  }

  for (let program of programs) {
    if (!program) continue

    const start = program.start ? dayjs.unix(program.start).utc().format('YYYYMMDDHHmmss ZZ') : ''
    const stop = program.stop ? dayjs.unix(program.stop).utc().format('YYYYMMDDHHmmss ZZ') : ''
    const icon = escapeString(program.icon)

    if (start && stop) {
      output += `<programme start="${start}" stop="${stop}" channel="${escapeString(
        program.channel
      )}">`

      program.title.forEach(title => {
        output += `<title lang="${title.lang}">${escapeString(title.value)}</title>`
      })

      program.description.forEach(description => {
        output += `<desc lang="${description.lang}">${escapeString(description.value)}</desc>`
      })

      program.categories.forEach(category => {
        output += `<category lang="${category.lang}">${escapeString(category.value)}</category>`
      })

      program.icons.forEach(icon => {
        output += `<icon src="${icon}"/>`
      })

      output += '</programme>\r\n'
    }
  }

  output += '</tv>'

  return output
}

function escapeString(string, defaultValue = '') {
  if (!string) return defaultValue

  const regex = new RegExp(
    '((?:[\0-\x08\x0B\f\x0E-\x1F\uFFFD\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]))|([\\x7F-\\x84]|[\\x86-\\x9F]|[\\uFDD0-\\uFDEF]|(?:\\uD83F[\\uDFFE\\uDFFF])|(?:\\uD87F[\\uDF' +
      'FE\\uDFFF])|(?:\\uD8BF[\\uDFFE\\uDFFF])|(?:\\uD8FF[\\uDFFE\\uDFFF])|(?:\\uD93F[\\uDFFE\\uD' +
      'FFF])|(?:\\uD97F[\\uDFFE\\uDFFF])|(?:\\uD9BF[\\uDFFE\\uDFFF])|(?:\\uD9FF[\\uDFFE\\uDFFF])' +
      '|(?:\\uDA3F[\\uDFFE\\uDFFF])|(?:\\uDA7F[\\uDFFE\\uDFFF])|(?:\\uDABF[\\uDFFE\\uDFFF])|(?:\\' +
      'uDAFF[\\uDFFE\\uDFFF])|(?:\\uDB3F[\\uDFFE\\uDFFF])|(?:\\uDB7F[\\uDFFE\\uDFFF])|(?:\\uDBBF' +
      '[\\uDFFE\\uDFFF])|(?:\\uDBFF[\\uDFFE\\uDFFF])(?:[\\0-\\t\\x0B\\f\\x0E-\\u2027\\u202A-\\uD7FF\\' +
      'uE000-\\uFFFF]|[\\uD800-\\uDBFF][\\uDC00-\\uDFFF]|[\\uD800-\\uDBFF](?![\\uDC00-\\uDFFF])|' +
      '(?:[^\\uD800-\\uDBFF]|^)[\\uDC00-\\uDFFF]))',
    'g'
  )

  string = String(string || '').replace(regex, '')

  return string
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/\n|\r/g, ' ')
    .replace(/  +/g, ' ')
    .trim()
}
