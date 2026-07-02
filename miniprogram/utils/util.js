// ============================================
// 通用工具函数 — 微信云开发版本
// ============================================

/**
 * 显示 Toast 提示
 */
function showToast(title, icon = 'none') {
  wx.showToast({
    title,
    icon,
    duration: 2000,
  });
}

/**
 * 显示加载中
 */
function showLoading(title = '加载中...') {
  wx.showLoading({
    title,
    mask: true,
  });
}

/**
 * 隐藏加载中
 */
function hideLoading() {
  wx.hideLoading();
}

/**
 * 显示确认对话框
 */
function showConfirm(title, content, confirmText = '确认', cancelText = '取消') {
  return new Promise((resolve) => {
    wx.showModal({
      title,
      content,
      confirmText,
      cancelText,
      confirmColor: '#FF3B30',
      success(res) {
        resolve(res.confirm);
      },
    });
  });
}

/**
 * 通过云存储 fileID 获取临时图片链接
 * 返回 Promise<string>，失败时返回空字符串
 */
function getTempFileUrl(fileID) {
  if (!fileID) return Promise.resolve('');
  return new Promise((resolve) => {
    wx.cloud.getTempFileURL({
      fileList: [fileID],
      success(res) {
        if (res.fileList[0] && res.fileList[0].tempFileURL) {
          resolve(res.fileList[0].tempFileURL);
        } else {
          resolve('');
        }
      },
      fail() {
        resolve('');
      },
    });
  });
}

module.exports = {
  showToast,
  showLoading,
  hideLoading,
  showConfirm,
  getTempFileUrl,
};
