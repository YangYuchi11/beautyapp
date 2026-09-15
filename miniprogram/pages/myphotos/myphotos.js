// ============================================
// 颜值评价（真人打分） - 我的照片页面
// ============================================

const api = require('../../utils/api');
const util = require('../../utils/util');

Page({
  data: {
    // 我的照片
    hasPhoto: false,        // 照片已通过检测、正常展示
    photoUrl: '',
    photoId: null,

    // 内容安全审核状态：'' | checking | approved | rejected
    photoStatus: '',
    hasPhotoRecord: false,  // 是否存在照片记录（含审核中/未通过）
    checkTimeout: false,    // 审核超过 30 分钟仍无结果

    // 性别
    gender: null, // 'male' | 'female'

    // 加载状态
    loading: true,

    // 解锁进度：累计给他人打分满 requiredCount 次才能查看分数
    // requiredCount 需与 getMyRating 云函数中的 REQUIRED_GIVEN_COUNT 保持一致
    givenCount: 0,
    requiredCount: 5,
    remainCount: 5,
    canViewScore: false,
    progressPercent: 0,

    // 分数弹窗
    showScoreModal: false,
    averageScore: 0,
    totalCount: 0,
    hasRatings: false,
    rank: null,
    rankTotal: 0,
    beatPercent: 0,

    // 未解锁提示弹窗
    showLockModal: false,
  },

  onLoad() {
    const app = getApp();
    app.checkLogin().then(() => {
      this.loadData();
    }).catch((err) => {
      console.error('登录失败:', err);
      util.showToast('登录失败，请重启小程序');
    });
  },

  onShow() {
    // 每次显示页面时刷新数据
    if (getApp().globalData.isLogin) {
      this.loadData();
    }
  },

  onHide() {
    this.stopStatusPolling();
  },

  onUnload() {
    this.stopStatusPolling();
  },

  // ============================================
  // 加载我的数据
  // ============================================
  loadData() {
    this.setData({ loading: true });

    Promise.all([
      api.getUserProfile().catch(() => null),
      api.getMyPhoto().catch(() => null),
    ]).then(([profile, photo]) => {
      // 更新性别
      if (profile && profile.gender) {
        this.setData({ gender: profile.gender });
      }

      // 更新解锁进度
      if (profile) {
        this.setData(this.buildGateData(profile.given_rating_count || 0));
      }

      // 更新照片及内容安全审核状态
      this.applyPhoto(photo);

      this.setData({ loading: false });
    }).catch((err) => {
      console.error('加载数据失败:', err);
      this.setData({ loading: false });
    });
  },

  // ============================================
  // 应用照片及审核状态
  // ============================================
  applyPhoto(photo) {
    if (photo) {
      const status = photo.status || 'approved';
      this.setData({
        hasPhotoRecord: true,
        photoStatus: status,
        hasPhoto: status === 'approved',
        photoUrl: photo.url,
        photoId: photo.photo_id,
        checkTimeout: status === 'checking' && this.isCheckTimeout(photo.check_submitted_at),
      });
      this.syncStatusPolling();
      return;
    }

    this.setData({
      hasPhotoRecord: false,
      photoStatus: '',
      hasPhoto: false,
      photoUrl: '',
      photoId: null,
      checkTimeout: false,
    });
    this.stopStatusPolling();
  },

  // 轮询专用：只查照片状态，不重复拉取用户资料
  refreshPhoto() {
    return api.getMyPhoto().then((photo) => {
      if (photo) {
        this.applyPhoto(photo);
      }
    }).catch(() => {
      // 静默失败，等待下次轮询
    });
  },

  // ============================================
  // 审核状态轮询
  // 异步检测结果最慢 30 分钟返回，这里在提交后的短时间内主动刷新
  // ============================================
  isCheckTimeout(submittedAt) {
    if (!submittedAt) return false;
    const t = new Date(submittedAt).getTime();
    if (isNaN(t)) return false;
    return Date.now() - t > 30 * 60 * 1000;
  },

  syncStatusPolling() {
    const needPoll = this.data.photoStatus === 'checking' && !this.data.checkTimeout;

    if (!needPoll) {
      this.stopStatusPolling();
      return;
    }

    if (this._statusTimer) return;

    this._statusTick = 0;
    this._statusTimer = setInterval(() => {
      this._statusTick += 1;
      // 最多轮询 2 分钟，之后交给用户手动刷新
      if (this._statusTick > 24) {
        this.stopStatusPolling();
        return;
      }
      this.refreshPhoto();
    }, 5000);
  },

  stopStatusPolling() {
    if (this._statusTimer) {
      clearInterval(this._statusTimer);
      this._statusTimer = null;
    }
  },

  onRefreshStatus() {
    util.showLoading('查询中...');
    api.getMyPhoto().then((photo) => {
      util.hideLoading();

      const status = (photo && photo.status) || '';
      if (status === 'checking') {
        util.showToast('照片仍在审核中，请稍后再看');
      } else if (status === 'rejected') {
        util.showToast('照片含违规信息');
      } else if (status === 'approved') {
        util.showToast('审核已通过 ✓');
      }

      this.applyPhoto(photo);
    }).catch(() => {
      util.hideLoading();
      util.showToast('查询失败，请重试');
    });
  },

  // ============================================
  // 性别选择
  // ============================================
  onGenderSelect(e) {
    const gender = e.currentTarget.dataset.gender;
    if (gender === this.data.gender) return;

    util.showLoading('保存中...');

    api.updateUserProfile({ gender }).then(() => {
      util.hideLoading();
      this.setData({ gender });
      util.showToast('性别设置成功');
    }).catch((err) => {
      util.hideLoading();
      util.showToast(err.message || '设置失败');
    });
  },

  // ============================================
  // 上传照片
  // ============================================
  onUploadPhoto() {
    // 检查是否已设置性别
    if (!this.data.gender) {
      wx.showModal({
        title: '提示',
        content: '请先设置您的性别后再上传照片',
        showCancel: false,
        confirmText: '知道了',
      });
      return;
    }

    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const filePath = res.tempFilePaths[0];

        // 检查文件大小（前端预检）
        wx.getFileInfo({
          filePath,
          success: (info) => {
            if (info.size > 5 * 1024 * 1024) {
              util.showToast('照片大小不能超过 5MB');
              return;
            }

            // 上传
            util.showLoading('上传中...');

            api.uploadPhoto(filePath).then(() => {
              util.hideLoading();
              util.showToast('照片已提交审核');
              // 刷新页面数据
              this.loadData();
            }).catch((err) => {
              util.hideLoading();
              if (err.message && err.message.includes('性别')) {
                util.showToast('请先设置您的性别');
              } else {
                util.showToast(err.message || '上传失败，请重试');
              }
            });
          },
        });
      },
    });
  },

  // ============================================
  // 解锁进度（已评价他人次数 → 页面展示状态）
  // ============================================
  buildGateData(givenCount) {
    const required = this.data.requiredCount;
    return {
      givenCount,
      remainCount: Math.max(required - givenCount, 0),
      canViewScore: givenCount >= required,
      progressPercent: Math.min(Math.round((givenCount / required) * 100), 100),
    };
  },

  // ============================================
  // 查看分数
  // ============================================
  onViewScore() {
    util.showLoading('查询中...');

    api.getMyRating().then((data) => {
      util.hideLoading();

      // 未满 5 次给别人打分，提示去打分
      if (!data.can_view) {
        this.setData(Object.assign(
          { showLockModal: true },
          this.buildGateData(data.given_count || 0)
        ));
        return;
      }

      this.setData(Object.assign({
        showScoreModal: true,
        averageScore: data.average_score,
        totalCount: data.total_count,
        hasRatings: data.has_ratings,
        rank: data.rank,
        rankTotal: data.rank_total,
        beatPercent: data.beat_percent,
      }, this.buildGateData(data.given_count || 0)));
    }).catch((err) => {
      util.hideLoading();
      util.showToast(err.message || '查询失败');
    });
  },

  onCloseScoreModal() {
    this.setData({ showScoreModal: false });
  },

  onCloseLockModal() {
    this.setData({ showLockModal: false });
  },

  // 去打分页
  onGoRating() {
    this.setData({ showLockModal: false });
    wx.switchTab({ url: '/pages/rating/rating' });
  },

  // ============================================
  // 删除照片
  // ============================================
  onDeletePhoto() {
    const isPending = this.data.photoStatus === 'checking';

    util.showConfirm(
      '确认删除',
      isPending
        ? '该照片还在审核中，确定要删除吗？'
        : '删除后该照片的所有评分数据将被清空，且不可恢复。确定要删除吗？',
      '确认删除',
      '取消'
    ).then((confirmed) => {
      if (!confirmed) return;

      util.showLoading('删除中...');

      api.deletePhoto().then(() => {
        util.hideLoading();
        util.showToast('照片已删除');
        this.setData({
          hasPhotoRecord: false,
          photoStatus: '',
          hasPhoto: false,
          photoUrl: '',
          photoId: null,
          checkTimeout: false,
        });
        this.stopStatusPolling();
      }).catch((err) => {
        util.hideLoading();
        util.showToast(err.message || '删除失败');
      });
    });
  },

  // ============================================
  // 下拉刷新
  // ============================================
  onPullDownRefresh() {
    this.loadData();
    wx.stopPullDownRefresh();
  },
});
