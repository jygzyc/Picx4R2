export interface Result {
    code: number
    msg: string
    data?: any
}

export interface ImgItem {
    key : string
    url : string
    size: number
    copyUrl: string
    filename ?: string
}

export interface ImgList {
    next: boolean
    cursor ?: string
    list : Array<ImgItem>
    prefixes ?: Array<String>
}

export interface ImgReq {
    limit: number,
    cursor ?: string
    delimiter ?: string
}

// 文件夹名称
export interface Folder {
    name: string
}

export function AuthError(msg: string): Result {
    return <Result> {
        code: StatusCode.AUTH_ERROR,
        msg: msg,
        data: null
    }
}

export function Error(msg : string) : Result {
    return <Result> {
        code: StatusCode.ERROR,
        msg: msg,
        data: null
    }
}

export function Ok(data : any) : Result {
    return <Result> {
        code: StatusCode.OK,
        msg: "ok",
        data: data
    }
}

export function Build(data : any, msg: string) : Result {
    return <Result> {
        code: StatusCode.OK,
        msg: msg,
        data: data
    }
}

enum StatusCode {
    OK = 200,
    ERROR = 500,
    AUTH_ERROR = 401,

}

export interface AuthToken {
    token: string
}
export default StatusCode
