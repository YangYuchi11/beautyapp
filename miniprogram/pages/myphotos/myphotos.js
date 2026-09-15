// ============================================
// 颜值评价（真人打分） - 我的照片页面
// ============================================

const api = require('../../utils/api');
const util = require('../../utils/util');

Page({
  data: {
    // 我的照片
    hasPhoto: false,
    photoUrl: '',
    photoId: null,

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

      // 更新照片
      if (photo) {
        this.setData({
          hasPhoto: true,
          photoUrl: photo.url,
          photoId: photo.photo_id,
        });
      } else {
        this.setData({
          hasPhoto: false,
          photoUrl: '',
          photoId: null,
        });
      }

      this.setData({ loading: false });
    }).catch((err) => {
      console.error('加载数据失败:', err);
      this.setData({ loading: false });
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
              util.showToast('上传成功 ✓');
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
    util.showConfirm(
      '确认删除',
      '删除后该照片的所有评分数据将被清空，且不可恢复。确定要删除吗？',
      '确认删除',
      '取消'
    ).then((confirmed) => {
      if (!confirmed) return;

      util.showLoading('删除中...');

      api.deletePhoto().then(() => {
        util.hideLoading();
        util.showToast('照片已删除，评分数据已清空');
        this.setData({
          hasPhoto: false,
          photoUrl: '',
          photoId: null,
        });
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
