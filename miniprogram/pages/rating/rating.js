// ============================================
// 颜值评价（真人打分） - 打分系统页面
// ============================================

const api = require('../../utils/api');
const util = require('../../utils/util');

Page({
  data: {
    // 推送偏好：all / male / female
    pushPref: 'all',

    // 当前照片信息
    photoId: null,
    photoUrl: '',

    // 倒计时
    countdown: 5,
    totalSeconds: 5,
    countdownTimer: null,

    // 照片是否已隐藏
    photoHidden: false,

    // 是否加载中
    loading: false,

    // 是否无照片可推送
    isEmpty: false,
    emptyMessage: '暂无更多照片可供评价\n快去「我的照片」上传一张吧！',

    // 可选分数列表
    scores: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],

    // 当前选中的分数
    selectedScore: null,
  },

  onLoad() {
    // 确保已登录
    const app = getApp();
    app.checkLogin().then(() => {
      this.loadUserPref();
      this.loadNextPhoto();
    }).catch((err) => {
      console.error('登录失败:', err);
      util.showToast('登录失败，请重启小程序');
    });
  },

  onShow() {
    // 从其他页面切回时，如果当前没有照片，重新加载
    if (!this.data.photoId && !this.data.loading && !this.data.isEmpty) {
      this.loadNextPhoto();
    }
  },

  onHide() {
    // 页面切后台，清空倒计时，该轮作废
    this.clearCountdown();
    this.setData({
      photoHidden: true,
      photoId: null,
      photoUrl: '',
      countdown: 0,
      selectedScore: null,
    });
  },

  onUnload() {
    this.clearCountdown();
  },

  // ============================================
  // 加载用户推送偏好
  // ============================================
  loadUserPref() {
    api.getUserProfile().then((user) => {
      if (user && user.push_gender_pref) {
        this.setData({ pushPref: user.push_gender_pref });
      }
    }).catch(() => {
      // 静默失败，使用默认值
    });
  },

  // ============================================
  // 切换性别筛选
  // ============================================
  onFilterChange(e) {
    const pref = e.currentTarget.dataset.pref;
    if (pref === this.data.pushPref) return;

    this.setData({
      pushPref: pref,
      photoId: null,
      photoUrl: '',
      photoHidden: false,
      selectedScore: null,
      isEmpty: false,
    });

    this.clearCountdown();

    // 更新后端偏好
    api.updateUserProfile({ push_gender_pref: pref }).catch(() => {});

    // 重新加载照片
    this.loadNextPhoto();
  },

  // ============================================
  // 加载下一张照片
  // ============================================
  loadNextPhoto() {
    this.clearCountdown();

    this.setData({
      loading: true,
      photoHidden: false,
      selectedScore: null,
      isEmpty: false,
    });

    api.getNextPhoto().then((data) => {
      if (!data) {
        // 无照片可推送
        this.setData({
          loading: false,
          isEmpty: true,
          emptyMessage: this.getEmptyMessage(),
        });
        return;
      }

      this.setData({
        loading: false,
        photoId: data.photo_id,
        photoUrl: data.url,
        countdown: this.data.totalSeconds,
      });

      // 启动倒计时
      this.startCountdown();
    }).catch((err) => {
      console.error('加载照片失败:', err);
      this.setData({
        loading: false,
        isEmpty: true,
        emptyMessage: '加载失败，请下拉刷新',
      });
    });
  },

  // ============================================
  // 获取空状态文案
  // ============================================
  getEmptyMessage() {
    const prefMap = {
      all: '暂无更多照片可供评价\n快去「我的照片」上传一张吧！',
      male: '暂无男生照片可供评价\n试试切换筛选条件',
      female: '暂无女生照片可供评价\n试试切换筛选条件',
    };
    return prefMap[this.data.pushPref] || prefMap.all;
  },

  // ============================================
  // 5 秒倒计时
  // ============================================
  startCountdown() {
    this.clearCountdown();

    const timer = setInterval(() => {
      const newCount = this.data.countdown - 1;

      if (newCount <= 0) {
        // 倒计时结束，隐藏照片
        this.clearCountdown();
        this.setData({
          countdown: 0,
          photoHidden: true,
        });
      } else {
        this.setData({ countdown: newCount });
      }
    }, 1000);

    this._countdownTimer = timer;
  },

  clearCountdown() {
    if (this._countdownTimer) {
      clearInterval(this._countdownTimer);
      this._countdownTimer = null;
    }
  },

  // ============================================
  // 选择分数
  // ============================================
  onScoreSelect(e) {
    const score = e.currentTarget.dataset.score;
    this.setData({
      selectedScore: this.data.selectedScore === score ? null : score,
    });
  },

  // ============================================
  // 提交评分
  // ============================================
  onSubmit() {
    const { selectedScore, photoId, photoHidden } = this.data;

    if (!selectedScore) {
      util.showToast('请先选择分数');
      return;
    }

    if (!photoId) {
      util.showToast('当前没有可评分的照片');
      return;
    }

    if (!photoHidden) {
      util.showToast('请等待倒计时结束后打分');
      return;
    }

    util.showLoading('提交中...');

    api.submitRating(photoId, selectedScore).then(() => {
      util.hideLoading();
      util.showToast('评分成功 ✓');

      // 自动加载下一张
      this.setData({
        photoId: null,
        photoUrl: '',
        selectedScore: null,
        photoHidden: false,
      });
      this.loadNextPhoto();
    }).catch((err) => {
      util.hideLoading();
      if (err.message && err.message.includes('已经给这张照片打过分')) {
        util.showToast('您已经给这张照片打过分了');
        // 跳过当前照片，加载下一张
        this.loadNextPhoto();
      } else {
        util.showToast(err.message || '提交失败，请重试');
      }
    });
  },

  // ============================================
  // 下拉刷新
  // ============================================
  onPullDownRefresh() {
    this.loadNextPhoto();
    wx.stopPullDownRefresh();
  },
});
