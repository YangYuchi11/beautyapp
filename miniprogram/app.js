// ============================================
// 颜值评价（真人打分）小程序 - 应用入口
// 微信云开发版本
// ============================================

const api = require('./utils/api');

App({
  globalData: {
    userInfo: null,
    isLogin: false,
    privacyAccepted: false,
    cloudEnvId: 'beautyapp-d8g53z50b73ca5621', // 云开发环境ID
  },

  // 登录锁：防止多个页面同时触发登录
  _loginPromise: null,

  onLaunch() {
    // 初始化云开发（环境ID需要替换为你的实际环境ID）
    if (wx.cloud) {
      wx.cloud.init({
        env: this.globalData.cloudEnvId,
        traceUser: true,
      });
      console.log('[云开发] 初始化完成');
    } else {
      console.warn('[云开发] 请升级微信基础库到 2.2.3 或更高版本');
    }

    // 检查隐私协议状态
    this.checkPrivacySetting();
  },

  checkPrivacySetting() {
    if (wx.getPrivacySetting) {
      wx.getPrivacySetting({
        success: (res) => {
          if (res.needAuthorization) {
            this.globalData.privacyAccepted = false;
          } else {
            this.globalData.privacyAccepted = true;
          }
        },
        fail: () => {
          this.globalData.privacyAccepted = true;
        },
      });
    } else {
      this.globalData.privacyAccepted = true;
    }
  },

  onPrivacyAgree() {
    this.globalData.privacyAccepted = true;
  },

  /**
   * 登录：调用 login 云函数获取/创建用户（带防并发锁）
   */
  login() {
    // 如果已有登录在进行中，直接返回同一个 Promise
    if (this._loginPromise) {
      return this._loginPromise;
    }

    // 如果已完成登录，直接返回
    if (this.globalData.isLogin && this.globalData.userInfo) {
      return Promise.resolve();
    }

    this._loginPromise = new Promise((resolve, reject) => {
      const doLogin = () => {
        api.login()
          .then((data) => {
            this.globalData.userInfo = {
              user_id: data.user_id,
              gender: data.gender,
              push_gender_pref: data.push_gender_pref,
            };
            this.globalData.isLogin = true;
            resolve(data);
          })
          .catch((err) => {
            this._loginPromise = null;
            reject(err);
          });
      };

      if (
        this.globalData.privacyAccepted === false &&
        wx.requirePrivacyAuthorize
      ) {
        wx.requirePrivacyAuthorize({
          success: () => {
            this.globalData.privacyAccepted = true;
            doLogin();
          },
          fail: (err) => {
            this._loginPromise = null;
            reject(new Error('需要同意隐私协议才能使用'));
          },
        });
      } else {
        doLogin();
      }
    });

    return this._loginPromise;
  },

  /**
   * 检查登录状态，未登录则自动登录
   */
  checkLogin() {
    if (this.globalData.isLogin && this.globalData.userInfo) {
      return Promise.resolve();
    }
    return this.login();
  },
});
