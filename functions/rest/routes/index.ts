import { router } from '../router';
import { Env } from '../[[path]]'
import { json } from 'itty-router-extras';
import { Ok, Error, AuthError, Build, ImgItem, ImgList, ImgReq, Folder, AuthToken } from "../type";
import { checkFileType, parseRange, getFilePath } from '../utils'
import { R2ListOptions, R2Object } from "@cloudflare/workers-types";

const auth = async (request: Request, env: Env) => {
    const method = request.method;
    // console.log(method)
    if (method == "GET" || method == "OPTIONS") {
        return
    }
    // get user token
    const token = request.headers.get('Authorization')
    if (!token) {
        return json(AuthError("Authorization field not exists"))
    }
    // with env auth_token equal
    const authKey = env.AUTH_TOKEN
    if (!authKey) {
        return json(AuthError("System is not configured with an `AUTH_TOKEN`"))
    }
    if (authKey != token) {
        return json(AuthError("Token does not match, authentication failed."))
    }
    // return new Response('Not Authenticated', { status: 401 })
}

// 检测token是否有效
router.post('/checkToken', async (request: Request, env: Env) => {
    const data = await request.json() as AuthToken
    const token = data.token
    if (!token) {
        return json(Ok(false))
    }
    const authKey = env.AUTH_TOKEN
    if (!authKey) {
        return json(Ok(false))
    }
    if (authKey != token) {
        return json(Ok(false))
    }
    return json(Ok(true))
})

// list image
router.post('/list', auth, async (request: Request, env: Env) => {
    const data = await request.json() as ImgReq
    if (!data.limit) {
        data.limit = 10
    }
    if (data.limit > 100) {
        data.limit = 100
    }
    if (!data.delimiter) {
        data.delimiter = "/"
    }
    let include = ""
    if (data.delimiter != "/") {
        include = data.delimiter
    }
    console.log(include)
    const options = <R2ListOptions>{
        limit: data.limit,
        cursor: data.cursor,
        delimiter: data.delimiter,
        prefix: include
    }
    const list = await env.R2.list(options)
    // console.log(list)
    const truncated = list.truncated ? list.truncated : false
    const cursor = truncated ? list.cursor : ""
    const objs = list.objects
    const urls = objs.map(it => {
        return <ImgItem>{
            url: `/rest/${it.key}`,
            copyUrl: `${env.COPY_URL}/${it.key}`,
            key: it.key,
            size: it.size
        }
    })
    return json(Ok(<ImgList>{
        list: urls,
        next: truncated,
        cursor: cursor,
        prefixes: list.delimitedPrefixes
    }))
})

// batch upload file
router.post('/upload', auth, async (req: Request, env: Env) => {
    const files = await req.formData()
    const images = files.getAll("files") as File[]
    const errs: string[] = []
    const urls = Array<ImgItem>()
    for (let item of images) {
        const fileType = item.type
        if (!checkFileType(fileType)) {
            errs.push(`${item.name}: ${fileType} not support.`)
            continue
        }
        const originFileName = item.name
        const filename = await getFilePath(fileType, originFileName)
        const fileStream = item.stream()
        const header = new Headers()
        header.set("content-type", fileType)
        header.set("content-length", `${item.size}`)
        try {
            const object = await env.R2.put(filename, fileStream, {
                httpMetadata: header,
            }) as R2Object
            if (object) {
                urls.push({
                    key: object.key,
                    size: object.size,
                    copyUrl: `${env.COPY_URL}/${object.key}`,
                    url: `/rest/${object.key}`,
                    filename: item.name
                })
            }
        } catch (error) {
            errs.push(`${originFileName}: Upload failed. ${error}`)
            console.log(`${originFileName}: Upload failed. ${error}`)
        }
    }
    return json(Build(urls, errs.join(' ')))
})

// 创建目录
router.post("/folder", auth, async (req: Request, env: Env) => {
    try {
        const data = await req.json() as Folder
        const regx = /^[0-9A-Za-z_-]+$/
        if (!regx.test(data.name)) {
            return json(Error("Folder name error"))
        }
        await env.R2.put(data.name + '/', null)
        return json(Ok("Success"))
    } catch (e) {
        return json(Error("Folder creation failed"))
    }
})

// 删除key
router.get('/del/:id+', async (req: Request, env: Env) => {
    const key = req.params.id
    if (!key) {
        return json(Error("Delete id error"))
    }
    try {
        await env.R2.delete(key)
    } catch (e) {
        console.log(`img delete error:${e.message}`,)
    }
    return json(Ok(key))
})

// delete image
router.delete("/", auth, async (req: Request, env: Env) => {
    const params = await req.json()
    // console.log(params)
    const keys = params.keys;
    if (!keys || keys.length < 1) {
        return json(Error("not delete keys"))
    }
    const arr = keys.split(',')
    try {
        for (let it of arr) {
            if (it && it.length) {
                await env.R2.delete(it)
            }
        }
    } catch (e) {
        console.log(`img delete error:${e.message}`,)
    }
    return json(Ok(keys))
})

// image detail
router.get("/:id+", async (req: Request, env: Env) => {
    let id = req.params.id
    const range = parseRange(req.headers.get('range'))
    const object = await env.R2.get(id, {
        range,
        onlyIf: req.headers,
    })
    if (object == null) {
        return json(Error("object not found"))
    }
    const headers = new Headers()
    object.writeHttpMetadata(headers)
    headers.set('etag', object.httpEtag)
    if (range) {
        headers.set("content-range", `bytes ${range.offset}-${range.end}/${object.size}`)
    }
    const status = object.body ? (range ? 206 : 200) : 304
    return new Response(object.body, {
        headers,
        status
    })
})
