const test = require('tape')
const Server = require('.')
const WS = require('ws')
const Client = require('ws-api-client')
const Events = require('events')
const request = require('request-promise')

const port = 8834
// const host = '0.0.0.0'
const host  = undefined

async function actions(...args){
  // console.log(...args)
  return args
}

test('server',t=>{
  let server,client,sessionid
  const events = new Events()
  t.test('init',async t=>{
    server = await Server({port,host,channels:['public','private']},{actions},(...args)=>console.log(...args))
    t.ok(server)
    t.end()
  })
  t.test('connect',async t=>{
    client = await Client(WS,{
      host:`http://localhost:${port}`,
      channels:['public','private']
    },(...args)=>events.emit(...args));

    // await new Promise((res,rej)=>{
    //   client.onopen = event=>{
    //     if(client.readyState === client.OPEN) res()
    //   }
    //   client.onerror = e=>rej(e)
    //   client.onclose = e=>rej(e)
    // }).catch(t.end)

    t.ok(client)
    t.end()
  })
  t.test('get',async t=>{
    const result = await request.get(`http://localhost:${port}`)
    console.log(result)
    t.end()
  })
  t.test('call',async t=>{
    const result = await client.actions.public('test',1,2,3)
    sessionid=result[0]
    console.log(result)
    t.end()
  })


  t.test('subscribe',async t=>{
    server.subscribe('public',sessionid)
    t.end()
  })
  t.test('publish',async t=>{
    events.once('change',state=>{
      console.log(state)
      t.end()
    })
    server.publish('public','public',[['test'],'ok'])
  })
  t.test('close',t=>{
    server.close()
    client.close()
    t.end()
  })
})
