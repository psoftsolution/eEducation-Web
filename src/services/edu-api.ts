import { AgoraFetch } from "../utils/fetch";
import { ClassState, AgoraUser, Me } from "../stores/room";
import {Map} from 'immutable'
import { getIntlError, setIntlError } from "./intl-error-helper";
import { globalStore } from "../stores/global";
import OSS from "ali-oss";
import axios from 'axios';
import Log from '../utils/LogUploader';

export interface UserAttrsParams {
  userId: string
  enableChat: number
  enableVideo: number
  enableAudio: number
  grantBoard: number
  coVideo?: number
}

const PREFIX: string = process.env.REACT_APP_AGORA_EDU_ENDPOINT_PREFIX as string;

const AUTHORIZATION_KEY: string = process.env.REACT_APP_AGORA_ENDPOINT_AK as string;

const AgoraFetchJson = async ({url, method, data, token, authorization}:{url: string, method: string, data?: any, token?: string, authorization?: string}) => {

  let authKey: string = AUTHORIZATION_KEY

  if (authorization) {
    authKey = authorization
  }
  
  const opts: any = {
    method,
    headers: {
      'Content-Type': 'application/json',
    }
  }

  if (authKey) {
    opts.headers['Authorization'] = `Basic ${authKey}`
  }

  if (token) {
    opts.headers['token'] = token;
  }
  if (data) {
    opts.body = JSON.stringify(data);
  }

  let resp = await AgoraFetch(`${PREFIX}${url}`, opts);

  const {code, msg, data: responseData} = resp

  if (code !== 0) {
    const error = getIntlError(`${code}`)
    const isErrorCode = `${error}` === `${code}`
    globalStore.showToast({
      type: 'eduApiError',
      message: isErrorCode ? `ErrorCode: ${code}` : error
    })
    throw {api_error: error, isErrorCode}
  }

  return responseData
}

export interface EntryParams {
  userName: string
  roomName: string
  type: number
  role: number
  uuid: string
}

export type RoomParams = Partial<{
  muteAllChat: boolean
  lockBoard: number
  courseState: number
  [key: string]: any
}>

type FileParams = {
  file: any,
  key: string,
  host: string,
  policy: any,
  signature: any,
  callback: any,
  accessid: string
}

const uploadLogToOSS = async ({
  file,
  key,
  host,
  policy,
  signature,
  callback,
  accessid
}: FileParams) => {
  const formData = new FormData()
  formData.append('name', 'test.log')
  formData.append('key', key)
  formData.append('file', file)
  formData.append('policy',policy)
  formData.append('OSSAccessKeyId',accessid)
  formData.append('success_action_status','200')
  formData.append('callback',callback)
  formData.append('signature',encodeURIComponent(signature).replace(/%20/g,'+'))
  return await axios.post(host, formData, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded'}
  })
}

export class AgoraEduApi {

  appID: string = '';
  authorization: string = '';
  roomId: string = '';
  public userToken: string = '';
  recordId: string = '';

  // fetch stsToken
  // 获取 stsToken
  async fetchUploadSignature(roomId: string) {
    let data = await AgoraFetchJson({
      url: `/v1/apps/${this.appID}/log/params`,
      method: 'GET',
    })

    // let resp = await fetch(`https://webdemo.agora.io/edu/v1/sts/test`, {
    //   headers: {
    //     'Content-Type': 'application/json',
    //   },
    //   method: 'GET'
    // });

    console.log("data", data)
    return {
      AccessKeyId: data.AccessKeyId as string,
      AccessKeySecret: data.AccessKeySecret as string,
      SecurityToken: data.SecurityToken as string,
    }
  }

  // upload log
  // 上报日志
  async uploadLog(params: any) {
    let data = await AgoraFetchJson({
      url: `/v1/log/room/${params.roomId}`,
      method: 'POST',
    })
  }

  async uploadLogFile(
    roomId: string,
    userId: string,
    platform: string,
    appVersion: string,
    ua: string,
    file: any
    ) {
    let {
      AccessKeyId,
      AccessKeySecret,
      SecurityToken,
    } = await this.fetchUploadSignature(roomId);
    const ossParams = {
      AccessKeyId,
      AccessKeySecret,
      SecurityToken,
    }
    const ossClient = new OSS({
      accessKeyId: AccessKeyId,
      accessKeySecret: AccessKeySecret,
      stsToken: SecurityToken,
      bucket: 'agora-adc-artifacts',
      endpoint: 'oss-cn-beijing.aliyuncs.com',
    })

    // ossClient.putBucket()
    await ossClient.put('sts/test/1585215812244', file);
    // await uploadLogToOSS({
    //   file,
    //   key,
    //   host,
    //   policy,
    //   accessid,
    //   signature,
    //   callback
    // })
    await this.uploadLog({
      key: '',
      policy: '',
      host: '',
      signature: '',
      expire: ''
    });
    return
  }

  // app config
  // 配置入口
  async config() {
    let data = await AgoraFetchJson({
      url: `/v1/config?platform=0&device=0&version=5.2.0`,
      method: 'GET',
    });

    if (data['multiLanguage']) {
      setIntlError(data['multiLanguage'])
    }

    return {
      appId: data.appId,
      authorization: data.authorization,
      room: data.room,
    }
  }

  // room entry
  // 房间入口
  async entry(params: EntryParams) {
    let data = await AgoraFetchJson({
      url: `/v1/apps/${this.appID}/room/entry`,
      method: 'POST',
      data: params,
      authorization: this.authorization,
    });
    
    this.roomId = data.roomId;
    this.userToken = data.userToken;
    return {
      data
    }
  }

  // refresh token
  // 刷新token 
  async refreshToken() {
    let data = await AgoraFetchJson({
      url: `/v1/apps/${this.appID}/room/${this.roomId}/token/refresh`,
      method: 'POST',
      token: this.userToken,
      authorization: this.authorization,
    });
    return {
      rtcToken: data.rtcToken,
      rtmToken: data.rtmToken,
      screenToken: data.screenToken
    }
  }

  // update course
  // 更新课程状态
  async updateCourse(params: Partial<RoomParams>) {
    const {room} = params
    let data = await AgoraFetchJson({
      url: `/v1/apps/${this.appID}/room/${this.roomId}`,
      method: 'POST',
      data: room,
      token: this.userToken,
      authorization: this.authorization
    });
    return {
      data,
    }
  }

  // @next
  // updateRoomUser
  // 更新用户状态，老师可更新房间内所有人，学生只能更新自己
  async updateRoomUser(user: Partial<UserAttrsParams>) {
    const {userId, ...userAttrs} = user
    let data = await AgoraFetchJson({
      url: `/v1/apps/${this.appID}/room/${this.roomId}/user/${userId}`,
      method: 'POST',
      data: userAttrs,
      token: this.userToken,
      authorization: this.authorization
    });
    return {
      data,
    }
  }

  // start recording
  // 开始录制
  async startRecording() {
    let data = await AgoraFetchJson({
      url: `/v1/apps/${this.appID}/room/${this.roomId}/record/start`,
      method: 'POST',
      data: {},
      token: this.userToken,
      authorization: this.authorization,
    });
    this.recordId = data.recordId
    return {
      data
    }
  }

  // stop recording
  // 结束录制
  async stopRecording(recordId: string) {
    let data = await AgoraFetchJson({
      url: `/v1/apps/${this.appID}/room/${this.roomId}/record/${recordId}/stop`,
      method: 'POST',
      token: this.userToken,
      authorization: this.authorization,
    })
    return {
      data
    }
  }

  // get recording list
  // 获取录制列表
  async getRecordingList () {
    let data = await AgoraFetchJson({
      url: `/v1/apps/${this.appID}/room/${this.roomId}/records`,
      method: 'GET',
      token: this.userToken,
      authorization: this.authorization,
    })
    return {
      data
    }
  }

  // get room info
  // 获取房间信息
  async getRoomInfoBy(roomId: string): Promise<{data: any}> {
    let data = await AgoraFetchJson({
      url: `/v1/apps/${this.appID}/room/${roomId}`,
      method: 'GET',
      token: this.userToken,
      authorization: this.authorization,
    });
    return {
      data: {
        room: data.room,
        users: data.room.coVideoUsers,
        user: data.user
      }
    }
  }

  // getRoomState
  // 获取用户状态
  async getRoomState(roomId: string): Promise<{usersMap: Map<string, AgoraUser>, room: Partial<ClassState>, me: Partial<Me>}> {
    const {data} = await this.getRoomInfoBy(roomId)
    const {users: rawUsers, room: rawCourse, user: me} = data

    let usersMap: Map<string, AgoraUser> = rawUsers.reduce((acc: Map<string, AgoraUser>, it: any) => {
      return acc.set(`${it.uid}`, {
        role: it.role,
        account: it.userName,
        uid: it.uid,
        video: it.enableVideo,
        audio: it.enableAudio,
        chat: it.enableChat,
        grantBoard: it.grantBoard,
        userId: it.userId,
        screenId: it.screenId,
      });
    }, Map<string, AgoraUser>());

    const room: Partial<ClassState> = {
      courseState: rawCourse.courseState,
      muteChat: rawCourse.muteAllChat,
      isRecording: rawCourse.isRecording,
      boardId: rawCourse.boardId,
      boardToken: rawCourse.boardToken,
      lockBoard: rawCourse.lockBoard,
      teacherId: ''
    }

    const teacher = usersMap.find((it: AgoraUser) => it.role === 1)

    if (teacher) {
      room.teacherId = teacher.uid
    }
    
    if (me.role === 1) {
      room.teacherId = me.uid
    }

    return {
      usersMap,
      room,
      me
    }
  }

  // getCourseState
  // 获取房间状态
  async getCourseState(roomId: string): Promise<Partial<ClassState>> {
    const {data} = await this.getRoomInfoBy(roomId)
    const {users, room} = data

    const result: Partial<ClassState> = {
      roomName: room.roomName,
      roomId: room.roomId,
      courseState: room.courseState,
      roomType: room.type,
      muteChat: room.muteAllChat,
      recordId: room.recordId,
      recordingTime: room.recordingTime,
      isRecording: Boolean(room.isRecording),
      boardId: room.boardId,
      boardToken: room.boardToken,
      lockBoard: room.lockBoard,
    }

    const teacher = users.find((it: any) => it.role === 1)
    if (teacher) {
      result.teacherId = teacher.uid
      result.screenId = teacher.screenId
      result.screenToken = teacher.screenToken
    }

    return result
  }

  // login 登录教室
  async Login(params: EntryParams) {
    if (!this.appID) {
      let {appId, authorization} = await this.config()
      this.appID = appId
      this.authorization = authorization
    }
    if (!this.appID) throw `appId is empty: ${this.appID}`
    let {data: {roomId, userToken}} = await this.entry(params)

    const {data: {room, user, users: userList = []}} = await this.getRoomInfoBy(roomId)

    const me = user

    const teacherState = userList.find((user: any) => +user.role === 1)

    const course: any = {
      rid: room.channelName,
      roomName: room.roomName,
      channelName: room.channelName,
      roomId: room.roomId,
      roomType: room.type,
      courseState: room.courseState,
      muteAllChat: room.muteAllChat,
      isRecording: room.isRecording,
      recordId: room.recordId,
      recordingTime: room.recordingTime,
      boardId: room.boardId,
      boardToken: room.boardToken,
      lockBoard: room.lockBoard,
      teacherId: 0
    }

    if (teacherState) {
      course.teacherId = +teacherState.uid
    }

    if (me.role === 1) {
      course.teacherId = me.uid
    }

    if (params.uuid) {
      me.uuid = params.uuid
    }

    const coVideoUids = userList.map((it: any) => `${it.uid}`)

    if (course.teacherId && coVideoUids.length) {
      course.coVideoUids = coVideoUids.filter((uid: any) => `${uid}` !== `${course.teacherId}`)
    }

    const result = {
      course,
      me,
      users: userList,
      appID: this.appID,
      onlineUsers: room.onlineUsers,
    }

    return result
  }

  async getCourseRecordBy(recordId: string, roomId: string, token: string) {
    if (!this.appID) {
      let {appId, authorization} = await this.config()
      this.appID = appId
      this.authorization = authorization
    }
    this.userToken = token
    let data = await AgoraFetchJson({
      url: `/v1/apps/${this.appID}/room/${roomId}/record/${recordId}`,
      method: 'GET',
      token: this.userToken,
      authorization: this.authorization,
    });
    const teacherRecord = data.recordDetails.find((it:any) => it.role === 1)

    const recordStatus = [
      'recording',
      'finished',
      'finished_recording_to_be_download',
      'finished_download_to_be_convert',
      'finished_convert_to_be_upload'
    ]

    const result = {
      boardId: data.boardId,
      boardToken: data.boardToken,
      startTime: data.startTime,
      endTime: data.endTime,
      url: teacherRecord?.url,
      status: data.status,
      statusText: recordStatus[data.status],
    }
    return result
  }
}

export const eduApi = new AgoraEduApi();